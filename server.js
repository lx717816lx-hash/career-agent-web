import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// 静态文件 - 生产环境
app.use(express.static(path.join(__dirname, 'dist')));

// 文件上传配置
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.docx', '.txt'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 PDF、DOCX、TXT 格式文件'));
    }
  },
});

// OpenAI 兼容客户端
function createAIClient() {
  if (!process.env.AI_API_KEY || process.env.AI_API_KEY === '请填写你的APIKey') {
    throw new Error('请先配置 AI_API_KEY 环境变量');
  }
  return new OpenAI({
    apiKey: process.env.AI_API_KEY,
    baseURL: process.env.AI_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  });
}

// 通用 AI 调用
async function callAI(systemPrompt, userMessage) {
  const client = createAIClient();
  const model = process.env.AI_MODEL || 'qwen-plus';
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 4096,
  });
  return response.choices[0].message.content;
}

// 流式 AI 调用
async function callAIStream(systemPrompt, userMessage, res) {
  const client = createAIClient();
  const model = process.env.AI_MODEL || 'qwen-plus';
  const stream = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 4096,
    stream: true,
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let fullContent = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || '';
    if (delta) {
      fullContent += delta;
      res.write(`data: ${JSON.stringify({ delta })}\n\n`);
    }
  }
  res.write(`data: ${JSON.stringify({ done: true, fullContent })}\n\n`);
  res.end();
}

// ============ 文件解析 ============

async function parsePDF(buffer) {
  const data = await pdfParse(buffer);
  return data.text;
}

async function parseDOCX(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function parseTXT(buffer) {
  return buffer.toString('utf-8');
}

// ============ API 路由 ============

// 简历上传与解析
app.post('/api/upload-resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传简历文件' });
    }
    const { buffer, originalname } = req.file;
    const ext = path.extname(originalname).toLowerCase();
    let text = '';

    if (ext === '.pdf') {
      text = await parsePDF(buffer);
    } else if (ext === '.docx') {
      text = await parseDOCX(buffer);
    } else if (ext === '.txt') {
      text = parseTXT(buffer);
    } else {
      return res.status(400).json({ error: '不支持的文件格式' });
    }

    if (!text.trim()) {
      return res.status(400).json({ error: '无法从文件中提取文本，请检查文件内容' });
    }

    res.json({ text: text.trim(), filename: originalname });
  } catch (err) {
    console.error('简历解析错误:', err);
    res.status(500).json({ error: '简历解析失败：' + err.message });
  }
});

// 求职诊断
app.post('/api/analyze-profile', async (req, res) => {
  try {
    const { profile, resumeText } = req.body;
    if (!profile) {
      return res.status(400).json({ error: '请填写个人信息' });
    }

    const systemPrompt = `你是一名拥有多年互联网、国企、校招和实习招聘经验的资深 HR 和职业规划顾问。你的任务是根据用户的教育背景、校园经历、工作经历、技能证书等信息，进行全面的求职诊断。

你必须遵守以下规则：
1. 不能编造学历、实习、证书、奖项、项目或工作经历
2. 可以在用户真实经历基础上进行专业化分析
3. 如果缺少关键信息，要明确指出并建议补充
4. 不要承诺一定拿 offer
5. 不要说"保证得到 HR 高度认可"，应表述为"尽量符合资深 HR 的筛选偏好，提高通过率"

请输出以下结构：
一、背景优势分析
二、背景不足与风险
三、求职竞争力评估（1-10分，并说明理由）
四、适合的岗位方向建议
五、简历需要改进的关键点
六、能力提升建议
七、求职策略建议`;

    const userProfile = buildUserProfile(profile, resumeText);
    await callAIStream(systemPrompt, userProfile, res);
  } catch (err) {
    console.error('求职诊断错误:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI 分析失败：' + err.message });
    }
  }
});

// 简历优化
app.post('/api/optimize-resume', async (req, res) => {
  try {
    const { profile, resumeText, jobDescription } = req.body;
    if (!resumeText && !profile) {
      return res.status(400).json({ error: '请提供简历或个人信息' });
    }

    const systemPrompt = `你是一名拥有多年互联网、国企、校招和实习招聘经验的资深 HR，同时也是简历优化专家。你的任务是根据用户真实经历和目标岗位 JD，帮助用户修改简历，使其更专业、更具体、更符合 HR 筛选习惯。

你必须：
- 先分析岗位 JD 的核心要求
- 再分析用户简历当前问题
- 再给出逐段修改建议
- 最后输出修改后的专业版简历
- 使用"动作 + 工作内容 + 方法工具 + 结果产出 + 能力体现"的表达方式
- 不得编造经历、证书、奖项、数据
- 如果缺少数据，要用"建议补充：……"提示用户
- 优先使用 STAR 法则
- 不要承诺一定拿 offer
- 不要说"保证得到 HR 高度认可"，应表述为"尽量符合资深 HR 的筛选偏好，提高通过率"

输出结构：
一、岗位 JD 核心要求
二、原简历主要问题
三、HR 筛选风险
四、逐段修改建议
五、修改后的专业版简历
六、还需要用户补充的信息`;

    const userMsg = buildResumeMessage(profile, resumeText, jobDescription);
    await callAIStream(systemPrompt, userMsg, res);
  } catch (err) {
    console.error('简历优化错误:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI 分析失败：' + err.message });
    }
  }
});

// 岗位推荐（基于个人档案，不需要JD）
app.post('/api/match-jobs', async (req, res) => {
  try {
    const { profile, resumeText, jobDescription } = req.body;

    const systemPrompt = `你是一名资深职业规划顾问和招聘专家。请根据用户的学历、学校、专业、校园经历、工作经历、技能、求职城市、荣誉奖项、求职类型（实习/校招/社招）等信息，全面分析用户的求职竞争力，并推荐匹配的公司和岗位。

注意：
- 必须基于用户的真实背景进行分析，不得编造经历、证书、奖项
- 推荐的公司和岗位要具体，包括公司名称、岗位名称、匹配理由
- 不要承诺一定拿 offer
- 如果用户没有提供目标行业/岗位，根据其背景智能推断最适合的方向
- 根据求职类型（实习/校招/社招）调整推荐策略和公司类型
- 实习侧重日常实习和暑期实习机会，校招侧重应届生校招岗位，社招侧重社会招聘岗位

输出结构：
一、背景优势分析
二、背景不足与风险
三、求职竞争力评估（1-10分，并说明理由）
四、最适合的岗位方向建议
五、冲刺岗位（3-5个具体公司+岗位，匹配度较高但有挑战）
六、主投岗位（5-8个具体公司+岗位，匹配度最高）
七、保底岗位（3-5个具体公司+岗位，较有把握）
八、暂不建议岗位方向
九、能力提升建议
十、求职策略建议`;

    const userMsg = buildUserProfile(profile, resumeText);
    await callAIStream(systemPrompt, userMsg, res);
  } catch (err) {
    console.error('岗位推荐错误:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI 分析失败：' + err.message });
    }
  }
});

// 投递计划（基于岗位推荐结果+个人意愿）
app.post('/api/delivery-plan', async (req, res) => {
  try {
    const { profile, resumeText, jobDescription } = req.body;

    const systemPrompt = `你是一名资深求职规划顾问。请根据用户的个人背景和岗位推荐结果，制定 14 天投递计划。

注意：
- 计划要具体可执行，包含具体的公司名和岗位名
- 参考之前给出的冲刺/主投/保底岗位，安排投递节奏
- 考虑用户的求职城市偏好、行业偏好、求职偏好、求职类型（实习/校招/社招）
- 不能编造不存在的招聘信息
- 不要承诺一定拿 offer
- 投递计划必须使用 Markdown 表格格式输出，便于阅读

输出结构：
一、投递策略总览（冲刺/主投/保底的比例和时间分配）

二、简历版本规划（如需针对不同方向准备不同版本）

三、14天每日投递计划（使用 Markdown 表格，列：天数 | 日期 | 投递类型 | 公司 | 岗位 | 投递渠道 | 备注）

示例表格格式：
| 天数 | 日期 | 投递类型 | 公司 | 岗位 | 投递渠道 | 备注 |
|------|------|----------|------|------|----------|------|
| 第1天 | X月X日 | 主投 | XX公司 | XX岗位 | 官网/BOSS直聘 | 匹配度高 |

四、投递渠道建议（使用 Markdown 表格，列：渠道 | 适合类型 | 优势 | 注意事项）

五、面试准备安排（使用 Markdown 表格，列：天数 | 准备内容 | 具体任务）

六、复盘表格模板（使用 Markdown 表格，列：日期 | 投递公司 | 岗位 | 状态 | 回复情况 | 下一步）

七、跟进话术`;

    const userMsg = buildUserProfile(profile, resumeText);
    await callAIStream(systemPrompt, userMsg, res);
  } catch (err) {
    console.error('投递计划错误:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI 分析失败：' + err.message });
    }
  }
});

// 模拟面试 - 开始
app.post('/api/interview/start', async (req, res) => {
  try {
    const { profile, resumeText, jobDescription } = req.body;

    const systemPrompt = `你是一名拥有10年以上互联网行业招聘经验的资深HR，曾在字节跳动、腾讯等一线互联网公司担任高级面试官。你正在对候选人进行高质量的模拟面试，目标是帮助候选人达到资深HR认可的面试表达水平。

## 面试核心原则
1. 每次只问一个问题，等用户回答后再评价
2. 评价必须严格、专业、有建设性
3. 给出优化版回答后，再提出下一个问题
4. 绝不一次性问多个问题

## 面试流程设计
- 第1轮：请候选人做自我介绍（1-2分钟版本）
- 第2轮：针对简历中某个经历深入追问（STAR法则考察）
- 第3轮：岗位核心能力行为面试题（"请举例说明..."）
- 第4轮：情景面试题（"如果遇到...你会怎么处理"）
- 第5轮：项目/技术深度追问
- 第6轮：职业规划与求职动机
- 第7轮起：根据之前回答的薄弱点继续追问，或进入新领域
- 最后一轮：给候选人反问机会

## 评分标准（总分100分）
- 岗位匹配度（25分）：回答是否紧扣岗位要求，展示匹配的能力和经历
- 逻辑结构（20分）：回答是否有清晰的框架（背景→行动→结果），不东拉西扯
- 真实案例与数据（20分）：是否用具体的案例、数据、成果支撑论点，而非空泛描述
- 表达专业度（15分）：用词是否专业，是否体现行业理解，避免学生腔
- 风险控制（10分）：是否主动规避负面信息陷阱，回答是否留有余地
- 稳定性与求职动机（10分）：离职/求职原因是否合理，是否展示长期发展意愿

## 评分严格标准
- 90分以上：回答结构清晰，案例具体，数据充分，表达专业，完全符合资深HR期望
- 80-89分：回答较好，但部分维度仍有提升空间
- 70-79分：回答基本合格，但存在明显不足
- 60-69分：回答不够专业，需要较大改进
- 60分以下：回答存在严重问题

## 每轮评价格式（严格遵守）
【本轮评分】
- 岗位匹配度：X/25
- 逻辑结构：X/20
- 真实案例与数据：X/20
- 表达专业度：X/15
- 风险控制：X/10
- 稳定性与求职动机：X/10
- 总分：X/100

【HR点评】
优点：（至少1点）
不足：（至少1点）
风险提示：（如有）

【优化版回答】
（给出你作为资深HR认为更专业、更完整的回答版本，3-5句话）

【下一个问题】
（提出下一个面试问题）

## 停止条件
当用户连续3轮回答总分≥92分，且每个单项得分≥该项总分的80%，输出：
"🎉 你已经达到本岗位较高质量面试表达标准，本轮模拟面试结束。"
然后停止提问。

## 严禁事项
- 绝不能帮助用户编造经历、数据、项目
- 如果用户回答中包含疑似编造内容，必须在"风险提示"中指出
- 不能用"很好""不错"等模糊评价替代具体评分
- 不能跳过评分直接问下一题`;

    const userMsg = buildInterviewStartMessage(profile, resumeText, jobDescription);
    await callAIStream(systemPrompt, userMsg, res);
  } catch (err) {
    console.error('模拟面试启动错误:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI 分析失败：' + err.message });
    }
  }
});

// 模拟面试 - 回答
app.post('/api/interview/answer', async (req, res) => {
  try {
    const { profile, resumeText, jobDescription, history, answer } = req.body;

    const systemPrompt = `你是一名拥有10年以上互联网行业招聘经验的资深HR，曾在字节跳动、腾讯等一线互联网公司担任高级面试官。你正在对候选人进行高质量的模拟面试。

## 核心规则
1. 先严格评分用户上一轮回答
2. 给出具体、有建设性的点评
3. 提供优化版回答
4. 然后提出下一个面试问题
5. 每次只问一个问题

## 评分标准（总分100分）
- 岗位匹配度（25分）：回答是否紧扣岗位要求，展示匹配的能力和经历
- 逻辑结构（20分）：回答是否有清晰的框架（背景→行动→结果），不东拉西扯
- 真实案例与数据（20分）：是否用具体的案例、数据、成果支撑论点，而非空泛描述
- 表达专业度（15分）：用词是否专业，是否体现行业理解，避免学生腔
- 风险控制（10分）：是否主动规避负面信息陷阱，回答是否留有余地
- 稳定性与求职动机（10分）：离职/求职原因是否合理，是否展示长期发展意愿

## 每轮评价格式（严格遵守）
【本轮评分】
- 岗位匹配度：X/25
- 逻辑结构：X/20
- 真实案例与数据：X/20
- 表达专业度：X/15
- 风险控制：X/10
- 稳定性与求职动机：X/10
- 总分：X/100

【HR点评】
优点：（至少1点，具体说明好在哪里）
不足：（至少1点，具体说明如何改进）
风险提示：（如有，指出回答中的风险点）

【优化版回答】
（给出你作为资深HR认为更专业、更完整的回答版本，使用STAR法则，3-5句话，语言简洁有力）

【下一个问题】
（根据面试进度和候选人薄弱点，提出下一个有针对性的面试问题）

## 停止条件
当用户连续3轮回答总分≥92分，且每个单项得分≥该项总分的80%，输出：
"🎉 你已经达到本岗位较高质量面试表达标准，本轮模拟面试结束。"
然后停止提问。

## 评分严格度
- 打分要严格，不要轻易给高分
- 80分以上的回答必须是：结构清晰、案例具体、数据充分、表达专业
- 90分以上还需：回答有亮点、有深度、体现独特的思考
- 模糊、空泛、没有案例的回答不应超过70分

## 严禁事项
- 绝不能帮助用户编造经历、数据
- 如有疑似编造内容，必须在"风险提示"中指出
- 不能用"很好""不错"等模糊评价替代具体评分和点评
- 不能跳过评分直接问下一题`;

    const userMsg = buildInterviewAnswerMessage(profile, resumeText, jobDescription, history, answer);
    await callAIStream(systemPrompt, userMsg, res);
  } catch (err) {
    console.error('面试回答处理错误:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI 分析失败：' + err.message });
    }
  }
});

// AI解析简历为结构化档案
app.post('/api/parse-resume', async (req, res) => {
  try {
    const { resumeText } = req.body;
    if (!resumeText || !resumeText.trim()) {
      return res.status(400).json({ error: '请提供简历文本' });
    }

    const systemPrompt = `你是一个简历信息提取助手。请从用户的简历文本中提取结构化信息，以JSON格式返回。

你必须严格遵守以下规则：
1. 只提取简历中明确存在的信息，不要编造
2. 如果某个字段在简历中找不到，对应的值设为空字符串或空数组
3. 技能要按分类归入：language（语言）、computer（计算机）、newmedia（新媒体）、design（设计）、finance（金融/财会）、other（其他）
4. 经历要分为 campus（校园）、work（实习/工作）、project（项目/科研）三类
5. 每条经历包含 startTime（开始时间）、endTime（结束时间）、organization（组织/公司/社团）、content（工作内容/成果）
6. 每个技能条目包含 name（技能名称）和 level（等级/分数/掌握程度，如"580"、"熟练"、"掌握"）
7. 荣誉奖项使用数组格式，每条包含 time（获奖时间，如"2024.10"）和 award（奖项名称）

请返回如下JSON格式（不要包含其他文字，只返回纯JSON）：
{
  "education": "",
  "school": "",
  "major": "",
  "grade": "",
  "jobType": "",
  "city": "",
  "industry": "",
  "position": "",
  "preference": "",
  "honors": [{"time":"2024.10","award":"国家奖学金"}],
  "experiences": {
    "campus": [{"startTime":"","endTime":"","organization":"","content":""}],
    "work": [{"startTime":"","endTime":"","organization":"","content":""}],
    "project": [{"startTime":"","endTime":"","organization":"","content":""}]
  },
  "skills": {
    "language": [{"name":"英语 CET-6","level":"580"}],
    "computer": [{"name":"Python","level":"熟练"}],
    "newmedia": [],
    "design": [],
    "finance": [],
    "other": []
  },
  "languages": [{"type":"cet6","score":"580"}]
}

注意：
- jobType 根据简历内容判断："实习"、"校招"或"社招"，在校生默认为"校招"，有工作经历的默认为"社招"
- honors 为数组格式，每条包含 time 和 award 字段
- skills.language 中的 name 应使用标准名称如"英语 CET-4"、"英语 CET-6"、"雅思 IELTS"、"托福 TOEFL"、"日语 N1"、"日语 N2"等
- skills.computer 中的 name 使用标准名称如"Python"、"Java"、"JavaScript"、"C++"、"SQL"、"React"、"Vue"、"Node.js"、"Go"、"Docker"、"Git"、"Linux"、"计算机二级"、"计算机三级"、"计算机四级"等
- languages 数组是语言能力的补充格式，type 使用小写英文标识如 cet4、cet6、ielts、toefl 等
- level 字段填写具体分数或等级，如"580"、"7.0"、"熟练"、"掌握"、"了解"
- 如果简历中找不到对应信息，该数组保持为空数组[]`;

    const userMsg = `请从以下简历文本中提取结构化信息：\n\n${resumeText}`;

    // 使用非流式调用获取完整JSON
    const content = await callAI(systemPrompt, userMsg);

    // 尝试解析JSON
    let parsed;
    try {
      // 提取JSON部分（可能被markdown代码块包裹）
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('AI返回的内容中没有找到JSON');
      }
    } catch (parseErr) {
      console.error('解析AI返回的JSON失败:', parseErr.message);
      return res.json({});  // 解析失败返回空对象
    }

    res.json(parsed);
  } catch (err) {
    console.error('简历解析错误:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: '简历解析失败：' + err.message });
    }
  }
});

// ============ 辅助函数 ============

function buildUserProfile(profile, resumeText) {
  let msg = '以下是我的个人信息：\n';
  if (profile) {
    const basicFields = {
      education: '学历', school: '学校', major: '专业', grade: '年级/毕业时间',
      jobType: '求职类型', city: '求职城市', industry: '目标行业', position: '目标岗位',
      honors: '荣誉奖项', preference: '求职偏好',
      language: '语言能力',
    };
    for (const [key, label] of Object.entries(basicFields)) {
      if (profile[key]) msg += `${label}：${profile[key]}\n`;
    }

    // 结构化经历
    if (profile.experiences) {
      const expTypes = [
        { key: 'campus', label: '校园经历' },
        { key: 'work', label: '实习/工作经历' },
        { key: 'project', label: '项目/科研经历' },
      ];
      for (const t of expTypes) {
        const items = profile.experiences[t.key];
        if (items && items.length > 0) {
          const validItems = items.filter(e => e.organization || e.content);
          if (validItems.length > 0) {
            msg += `\n${t.label}：\n`;
            validItems.forEach((e, i) => {
              const time = (e.startTime || e.endTime) ? `${e.startTime || ''}${e.startTime && e.endTime ? '~' : ''}${e.endTime || ''}` : '';
              msg += `  ${i + 1}. ${time ? time + ' | ' : ''}${e.organization || '未填写'}${e.content ? '：' + e.content : ''}\n`;
            });
          }
        }
      }
    }

    // 结构化技能（支持数组和字符串两种格式）
    if (profile.skills && typeof profile.skills === 'object') {
      const skillCats = {
        language: '语言技能', computer: '计算机技能', newmedia: '新媒体技能',
        design: '设计技能', finance: '金融/财会技能', other: '其他技能',
      };
      for (const [catKey, catLabel] of Object.entries(skillCats)) {
        const items = profile.skills[catKey];
        if (items && items.length > 0) {
          // 支持数组格式：[{name, level}] 或 字符串数组
          const descs = items.map(item => {
            if (typeof item === 'object' && item.name) {
              return item.level ? `${item.name} ${item.level}` : item.name;
            }
            return String(item);
          });
          msg += `${catLabel}：${descs.join('、')}\n`;
        }
      }
    }
  }
  if (resumeText) msg += `\n我的简历文本：\n${resumeText}`;
  return msg;
}

function buildResumeMessage(profile, resumeText, jd) {
  let msg = '';
  if (profile) msg += buildUserProfile(profile);
  if (resumeText) msg += `\n我的简历文本：\n${resumeText}`;
  if (jd) {
    msg += `\n目标岗位 JD：\n`;
    if (jd.companyName) msg += `公司名称：${jd.companyName}\n`;
    if (jd.positionName) msg += `岗位名称：${jd.positionName}\n`;
    if (jd.responsibilities) msg += `岗位职责：${jd.responsibilities}\n`;
    if (jd.requirements) msg += `任职要求：${jd.requirements}\n`;
  }
  return msg || '请提供简历或个人信息';
}

function buildInterviewStartMessage(profile, resumeText, jd) {
  let msg = '';
  if (profile) msg += buildUserProfile(profile);
  if (resumeText) msg += `\n候选人简历文本：\n${resumeText}`;
  if (jd) {
    msg += `\n面试岗位 JD：\n`;
    if (jd.companyName) msg += `公司名称：${jd.companyName}\n`;
    if (jd.positionName) msg += `岗位名称：${jd.positionName}\n`;
    if (jd.responsibilities) msg += `岗位职责：${jd.responsibilities}\n`;
    if (jd.requirements) msg += `任职要求：${jd.requirements}\n`;
  }
  msg += '\n请开始面试。';
  return msg || '请开始面试。';
}

function buildInterviewAnswerMessage(profile, resumeText, jd, history, answer) {
  let msg = '';
  if (profile) msg += buildUserProfile(profile);
  if (resumeText) msg += `\n候选人简历文本：\n${resumeText}`;
  if (jd) {
    msg += `\n面试岗位 JD：\n`;
    if (jd.companyName) msg += `公司名称：${jd.companyName}\n`;
    if (jd.positionName) msg += `岗位名称：${jd.positionName}\n`;
    if (jd.responsibilities) msg += `岗位职责：${jd.responsibilities}\n`;
    if (jd.requirements) msg += `任职要求：${jd.requirements}\n`;
  }
  if (history && history.length > 0) {
    msg += '\n面试历史：\n';
    for (const item of history) {
      msg += `HR：${item.question}\n候选人：${item.answer}\n`;
    }
  }
  msg += `\n候选人本次回答：${answer}`;
  msg += '\n请评分、点评，给出优化版回答，并提出下一个问题。';
  return msg;
}

// SPA 回退 - 生产环境
app.get('*', (_req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('请先运行 npm run build 构建前端');
  }
});

// 错误处理
app.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: '文件大小不能超过 5MB' });
  }
  console.error('服务器错误:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 求职智能体服务已启动: http://localhost:${PORT}`);
  console.log(`📡 AI 模型: ${process.env.AI_MODEL || 'qwen-plus'}`);
  console.log(`🔗 AI 接口: ${process.env.AI_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1'}`);
});
