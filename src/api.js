const API_BASE = '/api';

// 内置默认 API 配置（DeepSeek）
const DEFAULT_API_CONFIG = {
  apiKey: 'sk-6b45cfc11a954fc08183e0a86679977a',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
};

// 获取 API 配置（用户自定义覆盖默认值）
function getUserApiConfig() {
  return {
    apiKey: localStorage.getItem('ai_api_key') || DEFAULT_API_CONFIG.apiKey,
    baseUrl: localStorage.getItem('ai_base_url') || DEFAULT_API_CONFIG.baseUrl,
    model: localStorage.getItem('ai_model') || DEFAULT_API_CONFIG.model,
  };
}

// 始终走前端直连 AI API（无需后端代理）
// 默认使用内置 DeepSeek 配置，用户可在设置中自定义
function canDirectCall() {
  return true;
}

// ============ 直接浏览器调用 AI API ============

async function directCallAIStream(config, systemPrompt, userMessage, onChunk, onDone, onError) {
  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 4096,
        stream: true,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      let errMsg = `AI API 错误 (${res.status})`;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error?.message || errJson.message || errMsg;
      } catch {}
      throw new Error(errMsg);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        onDone?.(fullContent);
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullContent += delta;
            onChunk?.(delta);
          }
        } catch {}
      }
    }
  } catch (err) {
    onError?.(err.message);
  }
}

async function directCallAI(config, systemPrompt, userMessage) {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let errMsg = `AI API 错误 (${res.status})`;
    try {
      const errJson = JSON.parse(errText);
      errMsg = errJson.error?.message || errJson.message || errMsg;
    } catch {}
    throw new Error(errMsg);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

// ============ 通过 Edge Function 中转调用 ============

async function streamRequest(url, body, onChunk, onDone, onError) {
  try {
    const config = getUserApiConfig();
    if (config.apiKey) body._apiKey = config.apiKey;
    if (config.baseUrl) body._baseUrl = config.baseUrl;
    if (config.model) body._model = config.model;

    const res = await fetch(`${API_BASE}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `请求失败 (HTTP ${res.status})，API 服务可能未就绪` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.done) {
              onDone?.(data.fullContent);
            } else if (data.delta) {
              onChunk?.(data.delta);
            }
          } catch {}
        }
      }
    }
  } catch (err) {
    onError?.(err.message);
  }
}

// ============ Prompt 定义（与 edge function 保持一致）============

const ANALYZE_PROMPT = `你是一名拥有多年互联网、国企、校招和实习招聘经验的资深 HR 和职业规划顾问。你的任务是根据用户的教育背景、校园经历、工作经历、技能证书等信息，进行全面的求职诊断。

你必须遵守以下规则：
1. 不能编造学历、实习、证书、奖项、项目或工作经历
2. 可以在用户真实经历基础上进行专业化分析
3. 如果缺少关键信息，要明确指出并建议补充
4. 不要承诺一定拿 offer
5. 不要说"保证得到 HR 高度认可"，应表述为"尽量符合资深 HR 的筛选偏好，提高通过率"
6. 分析必须客观、严格，不迎合用户，如实指出不足和风险
7. 对任何虚报、夸大或包装经历的行为要明确指出风险

请输出以下结构：
一、背景优势分析（实事求是，不过度美化）
二、背景不足与风险（必须坦诚指出，列出具体风险点）
三、求职竞争力评估（1-10分，基准：5分=普通应届生平均水平，并说明理由）
四、适合的岗位方向建议
五、简历需要改进的关键点
六、能力提升建议
七、求职策略建议`;

const OPTIMIZE_PROMPT = `你是一名拥有多年互联网、国企、校招和实习招聘经验的资深 HR，同时也是简历优化专家。你的任务是根据用户真实经历和目标岗位 JD，帮助用户修改简历，使其更专业、更具体、更符合 HR 筛选习惯。

你必须：
- 先分析岗位 JD 的核心要求，列出关键能力矩阵
- 再逐项对比用户简历与岗位要求的匹配程度（以0-100评分表示）
- 再给出逐段修改建议
- 最后输出修改后的专业版简历
- 使用"动作 + 工作内容 + 方法工具 + 结果产出 + 能力体现"的表达方式
- 不得编造经历、证书、奖项、数据
- 如果缺少数据，要用"建议补充：……"提示用户
- 优先使用 STAR 法则
- 不要承诺一定拿 offer
- 不要迎合用户，如实评价匹配程度
- 严格区分"已具备"和"需补强"的能力项

输出结构（必须严格遵守）：
一、岗位 JD 核心要求分析

二、岗位匹配度矩阵（使用 Markdown 表格，必须包含以下列：评估维度 | 岗位要求 | 用户现状 | 匹配度评分(0-100) | 差距说明）
评估维度至少包括：学历匹配、专业匹配、技能匹配、项目经验、实习经验、语言能力、软素质等

三、综合匹配度总评
匹配度：X（所有维度评分的加权平均，保留整数）

四、达到该岗位要求的必备经历与技能（详细列出该岗位需要的：实习/工作经历、项目经历、技能证书、语言能力、软素质等，区分"必须具备"和"加分项"）

五、你当前与岗位要求的差距分析（逐项对比，标注已具备✅和缺少❌，不可含糊其辞）

六、原简历主要问题（必须具体指出问题，不可笼统说"内容不够丰富"）

七、HR 筛选风险（诚实指出简历在HR眼中的硬伤和软肋）

八、逐段修改建议

九、修改后的专业版简历

十、还需要用户补充的信息

十一、如何弥补差距的行动建议（具体可执行的补强计划）`;

const MATCH_PROMPT = `你是一名资深职业规划顾问和招聘专家。请根据用户的学历、学校、专业、校园经历、工作经历、技能、求职城市、荣誉奖项、求职类型（实习/校招/社招）等信息，全面分析用户的求职竞争力，并推荐匹配的公司和岗位。

注意：
- 必须基于用户的真实背景进行分析，不得编造经历、证书、奖项
- 推荐的公司和岗位要具体，包括公司名称、岗位名称、匹配理由
- 不要承诺一定拿 offer
- 如果用户没有提供目标行业/岗位，根据其背景智能推断最适合的方向
- 根据求职类型（实习/校招/社招）调整推荐策略和公司类型
- 实习侧重日常实习和暑期实习机会，校招侧重应届生校招岗位，社招侧重社会招聘岗位
- 必须客观评估，不夸大用户竞争力，不迎合用户
- 不能帮助用户编造、美化或包装不存在的经历

输出结构：
一、背景优势分析（实事求是）
二、背景不足与风险（坦诚指出，不可模糊带过）
三、求职竞争力评估（1-10分，其中5分为普通应届生平均水平，严格评分并说明理由）
四、最适合的岗位方向建议
五、冲刺岗位（3-5个具体公司+岗位，匹配度较低但有挑战，注明挑战点）
六、主投岗位（5-8个具体公司+岗位，匹配度最高，注明匹配理由）
七、保底岗位（3-5个具体公司+岗位，较有把握，注明把握原因）
八、暂不建议岗位方向（说明原因）
九、能力提升建议
十、求职策略建议`;

const AGGREGATION_MATCH_PROMPT = `你是一名资深招聘数据分析师 + AI 岗位匹配专家。你的任务分两步：

## 第一步：多源公开招聘信息聚合
请分析当前主流招聘市场，基于以下平台的招聘特征，为用户聚合匹配的岗位信息：

| 来源平台 | 平台特点 | 适合人群 |
|---------|---------|---------|
| 🟢 Boss直聘 | 互联网/IT岗位最多，实时沟通 | 校招/社招 |
| 🔵 拉勾网 | 专注互联网行业 | 互联网技术岗 |
| 🟠 猎聘 | 中高端岗位，猎头活跃 | 社招 |
| 🟣 牛客网 | 校招笔试面试，大厂真题 | 校招/实习 |
| ⚪ 前程无忧 | 传统行业全覆盖 | 全类型 |
| 🏢 公司官网 | 一手招聘信息 | 目标明确者 |
| 🔴 脉脉 | 内推 + 社交招聘 | 社招/内推 |

聚合要求：
1. 基于用户的目标城市、行业、岗位方向，从各平台特征中筛选匹配的岗位
2. 每条岗位信息必须包含：来源平台、公司全称、岗位名称、薪资范围、学历要求、经验要求、核心技能要求
3. 必须给出每条岗位的**岗位匹配度评分**（0-100分），基于以下维度加权计算：
   - 学历匹配（20%）：用户学历 vs 岗位学历要求
   - 技能匹配（30%）：用户技能 vs 岗位核心技能要求
   - 经验匹配（25%）：用户经历 vs 岗位项目/工作经验要求
   - 城市/行业匹配（15%）：意向城市/行业 vs 岗位所在地/行业
   - 综合潜力（10%）：用户发展潜力与岗位成长空间
4. **禁止编造URL链接**。用"搜索关键词"列替代，格式如「公司名 岗位名」供用户自行去平台搜索

## 第二步：AI 岗位匹配
将聚合到的岗位与用户背景进行逐一匹配评估，给出匹配度评分。

## 输出结构（严格遵守）

一、📊 多源招聘信息聚合概览
| 来源平台 | 聚合岗位数 | 高分岗位(≥75分) | 覆盖行业/方向 |
|---------|-----------|---------------|-------------|

二、⭐ 高匹配岗位（匹配度 ≥ 75%）— 优先投递
| 匹配度 | 公司 | 岗位 | 薪资范围 | 来源 | 学历/经验 | 核心要求 | 搜索关键词 |
|--------|------|------|---------|------|----------|---------|-----------|

三、👍 中等匹配岗位（匹配度 50% - 74%）
格式同上

四、📌 保底岗位（匹配度 < 50%）
格式同上

五、🗺️ 投递渠道指引（非链接，为搜索建议）
说明每个平台的特点和搜索方法，例如：
- Boss直聘：搜索"公司名 岗位名"，筛选城市、经验等条件
- 公司官网：进入公司官网 → 加入我们/招聘页面 → 搜索岗位
- 脉脉：搜索公司名 → 查看招聘Tab → 找内推人

六、📈 综合求职竞争力评估
竞争力评分：X/10分
简要说明

七、📋 差距分析与提升建议
| 短板维度 | 当前状态 | 目标要求 | 提升建议 | 预计周期 |
|---------|---------|---------|---------|---------|

⚠️ 重要：所有岗位信息为市场分析参考，具体薪资和岗位以各平台实时信息为准。请自行前往对应平台搜索确认。`;

const DELIVERY_PROMPT = `你是一名资深求职规划顾问。请根据用户的个人背景和岗位推荐结果，制定 14 天投递计划。

注意：
- 计划要具体可执行，包含具体的公司名和岗位名
- 参考之前给出的冲刺/主投/保底岗位，安排投递节奏
- 考虑用户的求职城市偏好、行业偏好、求职偏好、求职类型（实习/校招/社招）
- 不能编造不存在的招聘信息
- 不要承诺一定拿 offer
- 投递计划必须使用 Markdown 表格格式输出，便于阅读
- 提醒用户：所有推荐公司和岗位需通过官方招聘渠道（公司官网、Boss直聘、拉勾、猎聘、智联招聘、前程无忧、牛客网、脉脉等）核实当前在招状态

输出结构：
一、投递策略总览（冲刺/主投/保底的比例和时间分配）
二、简历版本规划（如需针对不同方向准备不同版本）
三、14天每日投递计划（使用 Markdown 表格）
四、投递渠道建议（使用 Markdown 表格，列出具体渠道名称和网址）
五、面试准备安排（使用 Markdown 表格）
六、复盘表格模板（使用 Markdown 表格）
七、跟进话术`;

const INTERVIEW_VIDEO_SCORE_PROMPT = `你是一名严格的AI面试官。请对候选人的本轮回答进行严格评分（视频面试模式，但当前无真实面部表情分析数据，请仅依据回答内容质量评分）。

## 评分维度（总分100分，严格打分，不要给面子分）

### 内容维度（100分）
- 岗位匹配度（30分）：回答是否紧密结合JD要求，使用行业术语
- 逻辑结构（25分）：是否有清晰框架（优先STAR法则）、层次分明
- 真实案例与数据（25分）：是否用具体案例、量化数据和细节支撑观点
- 表达专业度（20分）：用词是否精准、表达是否流畅、语言是否专业

## 严格扣分规则
- 回答空洞、泛泛而谈（无具体案例）→ 匹配度+案例项大幅扣分
- 回答逻辑混乱、答非所问 → 逻辑结构项扣分
- 回答过于简短（不足50字）→ 各项扣分，总分不超30
- 回答与JD完全无关 → 总分不超20
- 回答完全是由AI生成或照搬模板 → 总分不超40

## 通过条件
总分≥80分 → 通过
否则 → 不通过，必须重试本题

## 输出格式（纯JSON，不要反引号不要markdown标记）
{
  "score": 75,
  "passed": false,
  "contentScore": 75,
  "expressionScore": 0,
  "feedback": "【内容评价】具体优缺点分析\\n【核心问题】回答中最主要的不足\\n【改进方向】下一版回答应如何优化",
  "optimizedAnswer": "按STAR法则给出的优化版回答示例（必须针对此题和JD定制）"
}`;

const INTERVIEW_TEXT_SCORE_PROMPT = `你是一名严格的AI面试官。请对候选人的本轮回答进行严格评分。

## 评分维度（总分100分，严格打分，不要给面子分）
- 岗位匹配度（30分）：回答是否紧密结合JD要求，使用行业术语
- 逻辑结构（25分）：是否有清晰框架（优先STAR法则）、层次分明
- 真实案例与数据（25分）：是否用具体案例、量化数据和细节支撑观点
- 表达专业度（20分）：用词是否精准、表达是否流畅、语言是否专业

## 严格扣分规则
- 回答空洞、泛泛而谈（无具体案例）→ 匹配度+案例项大幅扣分
- 回答逻辑混乱、答非所问 → 逻辑结构项扣分
- 回答过于简短（不足50字）→ 各项扣分，总分不超30
- 回答与JD完全无关 → 总分不超20
- 回答完全是由AI生成或照搬模板 → 总分不超40

## 通过条件
总分≥80分 → 通过
否则 → 不通过，必须重试本题

## 输出格式（纯JSON，不要反引号不要markdown标记）
{
  "score": 75,
  "passed": false,
  "contentScore": 75,
  "expressionScore": 0,
  "feedback": "【内容评价】具体优缺点分析\\n【核心问题】回答中最主要的不足\\n【改进方向】下一版回答应如何优化",
  "optimizedAnswer": "按STAR法则给出的优化版回答示例（必须针对此题和JD定制）"
}`;

const PARSE_RESUME_PROMPT = `你是一个简历信息提取助手。请从用户的简历文本中提取结构化信息，以JSON格式返回。

你必须严格遵守以下规则：
1. 只提取简历中明确存在的信息，不要编造
2. 如果某个字段在简历中找不到，对应的值设为空字符串或空数组
3. 技能要按分类归入：language（语言）、computer（计算机）、newmedia（新媒体）、design（设计）、finance（金融/财会）、other（其他）
4. 经历要分为 campus（校园）、work（实习/工作）、project（项目/科研）三类
5. 每条经历包含 startTime、endTime、organization、content
6. 每个技能条目包含 name 和 level
7. 荣誉奖项使用数组格式，每条包含 time 和 award

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
- jobType 根据简历内容判断："实习"、"校招"或"社招"
- honors 为数组格式，每条包含 time 和 award 字段
- skills.computer 中 name 可包含"计算机二级""计算机三级""计算机四级"
- 如果简历中找不到对应信息，该数组保持为空数组[]`;


// ============ 构建 Prompt 消息 ============

function buildUserProfileMsg(profile, resumeText) {
  let msg = '以下是我的个人信息：\n';
  if (profile) {
    if (profile.name) msg += `姓名：${profile.name}\n`;
    if (profile.age) msg += `年龄：${profile.age}岁\n`;
    if (profile.gender) msg += `性别：${profile.gender}\n`;
    const fields = {
      education: '学历', school: '学校', major: '专业',
      majorRanking: '专业排名', applyEducation: '应聘学历', jobType: '求职类型',
    };
    for (const [key, label] of Object.entries(fields)) {
      if (profile[key]) msg += `${label}：${profile[key]}\n`;
    }
    if (profile.citiesText || profile.city) msg += `求职城市：${profile.citiesText || profile.city}\n`;
    if (profile.industriesText || profile.industry) msg += `目标行业：${profile.industriesText || profile.industry}\n`;
    if (profile.positionsText || profile.position) msg += `目标岗位：${profile.positionsText || profile.position}\n`;
    if (profile.preferencesText || profile.preference) msg += `求职偏好：${profile.preferencesText || profile.preference}\n`;
    if (profile.honors) {
      if (Array.isArray(profile.honors)) {
        const t = profile.honors.filter(h => h.award?.trim()).map(h => h.time ? `${h.time} ${h.award}` : h.award).join('、');
        if (t) msg += `荣誉奖项：${t}\n`;
      } else if (typeof profile.honors === 'string') {
        msg += `荣誉奖项：${profile.honors}\n`;
      }
    }
    if (profile.honorsText) msg += `荣誉奖项：${profile.honorsText}\n`;
    if (profile.language) msg += `语言能力：${profile.language}\n`;
    if (profile.experiences) {
      const types = [{ key: 'campus', label: '校园经历' }, { key: 'work', label: '实习/工作经历' }, { key: 'project', label: '项目/科研经历' }];
      for (const t of types) {
        const items = profile.experiences[t.key];
        if (items?.length > 0) {
          const valid = items.filter(e => e.organization || e.content);
          if (valid.length > 0) {
            msg += `\n${t.label}：\n`;
            valid.forEach((e, i) => {
              const time = (e.startTime || e.endTime) ? `${e.startTime || ''}${e.startTime && e.endTime ? '~' : ''}${e.endTime || ''}` : '';
              msg += `  ${i + 1}. ${time ? time + ' | ' : ''}${e.organization || '未填写'}${e.content ? '：' + e.content : ''}\n`;
            });
          }
        }
      }
    }
    if (profile.skills && typeof profile.skills === 'object' && !Array.isArray(profile.skills)) {
      const cats = { language: '语言技能', computer: '计算机技能', newmedia: '新媒体技能', design: '设计技能', finance: '金融/财会技能', other: '其他技能' };
      for (const [k, l] of Object.entries(cats)) {
        const items = profile.skills[k];
        if (items?.length > 0) {
          const descs = items.map(i => typeof i === 'object' && i.name ? (i.level ? `${i.name} ${i.level}` : i.name) : String(i));
          msg += `${l}：${descs.join('、')}\n`;
        }
      }
    }
    if (profile.skillsText) msg += `技能概览：${profile.skillsText}\n`;
    if (profile.computer && typeof profile.computer === 'string') msg += `计算机技能：${profile.computer}\n`;
  }
  if (resumeText) msg += `\n我的简历文本：\n${resumeText}`;
  return msg;
}

function buildResumeMsg(profile, resumeText, jd) {
  let msg = buildUserProfileMsg(profile, '');
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

function buildInterviewStartMsg(profile, resumeText, jd) {
  let msg = buildUserProfileMsg(profile, '');
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

function buildInterviewAnswerMsg(profile, resumeText, jd, history, answer) {
  let msg = buildUserProfileMsg(profile, '');
  if (resumeText) msg += `\n候选人简历文本：\n${resumeText}`;
  if (jd) {
    msg += `\n面试岗位 JD：\n`;
    if (jd.companyName) msg += `公司名称：${jd.companyName}\n`;
    if (jd.positionName) msg += `岗位名称：${jd.positionName}\n`;
    if (jd.responsibilities) msg += `岗位职责：${jd.responsibilities}\n`;
    if (jd.requirements) msg += `任职要求：${jd.requirements}\n`;
  }
  if (history?.length > 0) {
    msg += '\n面试历史：\n';
    for (const item of history) {
      msg += `HR：${item.question}\n候选人：${item.answer}\n`;
    }
  }
  msg += `\n候选人本次回答：${answer}`;
  msg += '\n请评分、点评，给出优化版回答，并提出下一个问题。';
  return msg;
}


// ============ 客户端文件解析 ============

async function loadPdfJs() {
  if (window._pdfjsLib) return window._pdfjsLib;
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      window._pdfjsLib = window.pdfjsLib;
      return resolve(window.pdfjsLib);
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        window._pdfjsLib = window.pdfjsLib;
        resolve(window.pdfjsLib);
      } else {
        reject(new Error('pdf.js 加载失败'));
      }
    };
    script.onerror = () => reject(new Error('pdf.js CDN 加载失败'));
    document.head.appendChild(script);
  });
}

async function parsePDFClient(arrayBuffer) {
  try {
    const pdfjsLib = await loadPdfJs();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      text += pageText + '\n';
    }
    return text;
  } catch (err) {
    console.error('客户端PDF解析失败:', err);
    const bytes = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const raw = decoder.decode(bytes);
    const textParts = raw.match(/\(([^)]{2,})\)/g);
    if (textParts) {
      return textParts.map(p => p.slice(1, -1)).join(' ');
    }
    return '';
  }
}

async function parseDOCXClient(arrayBuffer) {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  } catch (err) {
    console.warn('mammoth 解析失败，尝试 ZIP+XML 方式:', err);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(arrayBuffer);
      const docXml = zip.file('word/document.xml');
      if (!docXml) throw new Error('无法找到 document.xml');
      const xmlContent = await docXml.async('string');
      const textParts = xmlContent.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
      if (textParts) {
        return textParts.map(p => p.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, '')).join('');
      }
      return '';
    } catch (zipErr) {
      console.error('ZIP+XML 解析也失败:', zipErr);
      throw new Error('DOCX 解析失败：' + err.message);
    }
  }
}

function parseTXTClient(arrayBuffer) {
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(arrayBuffer);
}

export async function uploadResume(file, onProgress) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (!['pdf', 'docx', 'txt'].includes(ext)) {
    throw new Error('仅支持 PDF、DOCX、TXT 格式文件');
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error('文件大小不能超过 5MB');
  }

  onProgress?.(10);

  const arrayBuffer = await file.arrayBuffer();

  onProgress?.(50);

  let text = '';
  try {
    if (ext === 'pdf') {
      text = await parsePDFClient(arrayBuffer);
    } else if (ext === 'docx') {
      text = await parseDOCXClient(arrayBuffer);
    } else if (ext === 'txt') {
      text = parseTXTClient(arrayBuffer);
    }
  } catch (err) {
    throw new Error('文件解析失败：' + err.message);
  }

  onProgress?.(100);

  if (!text.trim()) {
    throw new Error('无法从文件中提取文本，请检查文件内容');
  }

  return { text: text.trim(), filename: file.name };
}


// ============ AI 功能接口（优先直连，回退到 edge function）============

// 求职诊断
export function analyzeProfile(profile, resumeText, onChunk, onDone, onError) {
  if (canDirectCall()) {
    const config = getUserApiConfig();
    const userMsg = buildUserProfileMsg(profile, resumeText);
    return directCallAIStream(config, ANALYZE_PROMPT, userMsg, onChunk, onDone, onError);
  }
  return streamRequest('/analyze-profile', { profile, resumeText }, onChunk, onDone, onError);
}

// 简历优化
export function optimizeResume(profile, resumeText, jobDescription, onChunk, onDone, onError) {
  if (canDirectCall()) {
    const config = getUserApiConfig();
    const userMsg = buildResumeMsg(profile, resumeText, jobDescription);
    return directCallAIStream(config, OPTIMIZE_PROMPT, userMsg, onChunk, onDone, onError);
  }
  return streamRequest('/optimize-resume', { profile, resumeText, jobDescription }, onChunk, onDone, onError);
}

// 岗位匹配
export function matchJobs(profile, resumeText, jobDescription, onChunk, onDone, onError) {
  if (canDirectCall()) {
    const config = getUserApiConfig();
    const userMsg = buildUserProfileMsg(profile, resumeText);
    return directCallAIStream(config, MATCH_PROMPT, userMsg, onChunk, onDone, onError);
  }
  return streamRequest('/match-jobs', { profile, resumeText, jobDescription }, onChunk, onDone, onError);
}

// 多源招聘信息聚合 + AI岗位匹配
export function matchJobsWithAggregation(profile, resumeText, onChunk, onDone, onError) {
  if (canDirectCall()) {
    const config = getUserApiConfig();
    let userMsg = buildUserProfileMsg(profile, resumeText);
    userMsg += '\n\n请按照"多源公开招聘信息聚合 + AI岗位匹配"的流程，先聚合各平台在招岗位，再进行匹配分析。';
    return directCallAIStream(config, AGGREGATION_MATCH_PROMPT, userMsg, onChunk, onDone, onError);
  }
  return streamRequest('/match-jobs-aggregation', { profile, resumeText }, onChunk, onDone, onError);
}

// 投递计划
export function deliveryPlan(profile, resumeText, jobDescription, onChunk, onDone, onError) {
  if (canDirectCall()) {
    const config = getUserApiConfig();
    const userMsg = buildUserProfileMsg(profile, resumeText);
    return directCallAIStream(config, DELIVERY_PROMPT, userMsg, onChunk, onDone, onError);
  }
  return streamRequest('/delivery-plan', { profile, resumeText, jobDescription }, onChunk, onDone, onError);
}

// ============ 新版面试：一次性生成8题 ============
const GENERATE_8Q_PROMPT = `你是一名资深HR面试官。请根据目标岗位JD，一次性生成8个结构化面试问题。

## 出题要求
1. 问题必须紧密结合目标岗位JD中的职责和要求
2. 问题难度由浅入深，覆盖以下维度：
   - Q1：自我介绍与岗位匹配度
   - Q2-Q3：项目/实习经历深挖（STAR法则考察）
   - Q4-Q5：岗位核心专业能力考察
   - Q6：情景模拟/行为面试题
   - Q7：职业规划与岗位动机
   - Q8：综合素质考察
3. 每个问题必须具体、有针对性，不是通用问题
4. 输出格式：纯JSON数组，不要任何额外文字
5. JSON格式：["问题1文本","问题2文本",...,"问题8文本"]`;

export async function generate8Questions(profile, resumeText, jd) {
  const config = getUserApiConfig();
  let userMsg = '请根据以下岗位JD生成8个面试问题：\n';
  if (jd?.positionName) userMsg += `目标岗位：${jd.companyName || ''} ${jd.positionName}\n`;
  if (jd?.responsibilities) userMsg += `岗位职责：${jd.responsibilities}\n`;
  if (jd?.requirements) userMsg += `任职要求：${jd.requirements}\n`;
  // Also include profile for context
  if (profile && Object.keys(profile).length > 0) {
    userMsg += `\n候选人背景参考：\n${buildUserProfileMsg(profile, '').substring(0, 500)}`;
  }
  userMsg += '\n请一次性生成8个面试问题。';

  const content = await directCallAI(config, GENERATE_8Q_PROMPT, userMsg);
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return content.split('\n').filter(l => l.trim()).slice(0, 8);
  } catch { return ['请做一下自我介绍','介绍一下你的项目经历','你最擅长的技能是什么？','请举例说明你解决问题的能力','如果遇到和领导意见不合怎么办？','你的职业规划是什么？','你为什么选择我们公司？','你有什么问题想问我们？']; }
}

// 视频面试评分（仅基于内容质量，不使用表情数据）
export async function scoreVideoAnswer(question, answer, expressionData) {
  const config = getUserApiConfig();
  let userMsg = `面试问题：${question}\n候选人回答：${answer}`;
  // 表情数据当前不可用，只标注为"视频面试模式"
  userMsg += `\n\n[面试模式: 视频面试]\n注意：当前无面部表情分析数据，请仅依据回答内容质量严格评分。`;
  const content = await directCallAI(config, INTERVIEW_VIDEO_SCORE_PROMPT, userMsg);
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      result.expressionScore = 0;
      return result;
    }
    return { score: 40, passed: false, feedback: content, contentScore: 40, expressionScore: 0, optimizedAnswer: '' };
  } catch { return { score: 40, passed: false, feedback: content, contentScore: 40, expressionScore: 0, optimizedAnswer: '' }; }
}

// 文本面试评分
export async function scoreTextAnswer(question, answer) {
  const config = getUserApiConfig();
  const userMsg = `面试问题：${question}\n候选人回答：${answer}`;
  const content = await directCallAI(config, INTERVIEW_TEXT_SCORE_PROMPT, userMsg);
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      result.expressionScore = 0;
      return result;
    }
    return { score: 40, passed: false, feedback: content, contentScore: 40, expressionScore: 0, optimizedAnswer: '' };
  } catch { return { score: 40, passed: false, feedback: content, contentScore: 40, expressionScore: 0, optimizedAnswer: '' }; }
}

// 模拟面试 - 开始（保留兼容）
export function startInterview(profile, resumeText, jobDescription, onChunk, onDone, onError) {
  if (canDirectCall()) {
    const config = getUserApiConfig();
    const userMsg = buildInterviewStartMsg(profile, resumeText, jobDescription);
    return directCallAIStream(config, INTERVIEW_START_PROMPT, userMsg, onChunk, onDone, onError);
  }
  return streamRequest('/interview/start', { profile, resumeText, jobDescription }, onChunk, onDone, onError);
}

// 模拟面试 - 回答
export function answerInterview(profile, resumeText, jobDescription, history, answer, onChunk, onDone, onError) {
  if (canDirectCall()) {
    const config = getUserApiConfig();
    const userMsg = buildInterviewAnswerMsg(profile, resumeText, jobDescription, history, answer);
    return directCallAIStream(config, INTERVIEW_ANSWER_PROMPT, userMsg, onChunk, onDone, onError);
  }
  return streamRequest('/interview/answer', { profile, resumeText, jobDescription, history, answer }, onChunk, onDone, onError);
}

// ============ 招聘助手 Prompt ============

const ASSISTANT_PROMPT_MAP = {
  '央国企': `你是一名专注于央国企招聘的资深顾问，曾在中石油、国家电网、中国移动等大型央企和国企担任HR负责人。你深谙央国企的招聘流程、用人标准、面试风格和回答技巧。

央国企招聘特点：
- 重视政治素养、党员身份、组织纪律性
- 面试偏结构化，问题围绕忠诚度、稳定性、服从性
- 看重学历背景、专业对口、体制内实习经历
- 回答要体现踏实稳重、服从安排、长期服务的态度
- 常见问题：为什么选择国企？如何看待加班？职业规划是什么？

你需要：
1. 根据用户的问题，从央国企HR的视角给出专业的回答建议
2. 如果用户发来HR的面试问题，给出完美回答示例
3. 回答要贴合央国企文化和用人偏好
4. 给出回答技巧和注意事项
5. 不得帮助编造虚假经历`,

  '外企': `你是一名专注于外资企业招聘的资深顾问，曾在宝洁、联合利华、麦肯锡等知名外企担任高级招聘经理。你深谙外企的招聘流程、用人标准、面试风格和回答技巧。

外企招聘特点：
- 重视英语能力、跨文化沟通、全球化视野
- 面试偏行为面试（STAR法则），问题围绕领导力、创新、团队协作
- 看重主动性、结果导向、数据思维
- 回答要用具体案例和量化结果，体现个人贡献
- 常见问题：Tell me about yourself. Why this company? Biggest achievement?

你需要：
1. 根据用户的问题，从外企HR的视角给出专业的回答建议
2. 如果用户发来HR的面试问题，给出完美回答示例（中英文均可）
3. 回答要贴合外企文化和用人偏好
4. 给出回答技巧和注意事项
5. 不得帮助编造虚假经历`,

  '民企': `你是一名专注于民营企业的资深招聘顾问，曾在华为、美的、格力等知名民企担任HR总监。你深谙民企的招聘流程、用人标准、面试风格和回答技巧。

民企招聘特点：
- 重视实战能力、抗压能力、结果导向
- 面试偏务实，问题围绕项目经验、解决问题的能力
- 看重快速上手、多面手、创业精神
- 回答要体现执行力、灵活性、能吃苦的特质
- 常见问题：你最大的挫折是什么？如何处理与领导的分歧？

你需要：
1. 根据用户的问题，从民企HR的视角给出专业的回答建议
2. 如果用户发来HR的面试问题，给出完美回答示例
3. 回答要贴合民企文化和用人偏好
4. 给出回答技巧和注意事项
5. 不得帮助编造虚假经历`,

  '互联网大厂': `你是一名专注于互联网大厂招聘的资深顾问，曾在字节跳动、腾讯、阿里巴巴、美团等一线互联网公司担任高级面试官和技术Leader。你深谙互联网大厂的招聘流程、用人标准、面试风格和回答技巧。

互联网大厂招聘特点：
- 重视技术深度、项目复杂度、数据驱动
- 面试偏深挖细节，问题围绕技术选型、系统设计、难点攻克
- 看重自驱力、Owner意识、业务理解力
- 回答要用具体技术方案+量化收益+反思总结
- 常见问题：最有挑战的项目？技术选型考量？如何推动跨团队协作？

你需要：
1. 根据用户的问题，从互联网大厂面试官的视角给出专业的回答建议
2. 如果用户发来HR的面试问题，给出完美回答示例
3. 回答要贴合互联网大厂文化和用人偏好
4. 给出回答技巧和注意事项
5. 不得帮助编造虚假经历`,
};

const ASSISTANT_DEFAULT_PROMPT = `你是一名全能型求职招聘顾问，熟悉央国企、外企、民企、互联网大厂等各类企业的招聘流程和面试风格。

你的职责：
1. 帮助用户回答HR提出的各种面试问题
2. 根据用户的目标企业类型，给出针对性的回答策略
3. 提供专业的求职建议和职业规划指导
4. 如果用户直接发来HR的问题，请给出高质量的回答示例

回答要求：
- 专业、真诚、有建设性
- 使用STAR法则组织回答
- 给出具体技巧和注意事项
- 不得帮助编造虚假经历
- 如果用户没有指定企业类型，可以综合多种视角回答`;

export function getAssistantPrompt(perspective) {
  return ASSISTANT_PROMPT_MAP[perspective] || ASSISTANT_DEFAULT_PROMPT;
}

// 招聘助手聊天（流式）- 兼容旧接口
export function chatAssistant(profile, resumeText, perspective, messages, onChunk, onDone, onError) {
  const config = getUserApiConfig();
  const systemPrompt = getAssistantPrompt(perspective);

  let userContext = '';
  if (profile && Object.keys(profile).length > 0) {
    userContext = '\n\n以下是求职者的个人信息：\n' + buildUserProfileMsg(profile, resumeText);
  }

  // 构建完整消息数组，支持多轮对话
  const chatMessages = [
    { role: 'system', content: systemPrompt + userContext },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ];

  // 使用专用多轮对话函数
  return chatAssistantDirect(config, systemPrompt, userContext, messages, onChunk, onDone, onError);
}

// 招聘助手聊天（直连版本）
async function chatAssistantDirect(config, systemPrompt, userContext, messages, onChunk, onDone, onError) {
  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt + userContext },
          ...messages.map(m => ({ role: m.role, content: m.content })),
        ],
        temperature: 0.7,
        max_tokens: 4096,
        stream: true,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      let errMsg = `AI API 错误 (${res.status})`;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error?.message || errJson.message || errMsg;
      } catch {}
      throw new Error(errMsg);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        onDone?.(fullContent);
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullContent += delta;
            onChunk?.(delta);
          }
        } catch {}
      }
    }
  } catch (err) {
    onError?.(err.message);
  }
}

// 招聘助手聊天（代理版本）
async function chatAssistantProxy(systemPrompt, userContext, messages, onChunk, onDone, onError) {
  const config = getUserApiConfig();
  const body = {
    systemPrompt: systemPrompt,
    userContext: userContext,
    messages: messages,
    _apiKey: config.apiKey,
    _baseUrl: config.baseUrl,
    _model: config.model,
  };
  await streamRequest('/chat-assistant', body, onChunk, onDone, onError);
}

// 招聘助手聊天（流式，完整多轮对话）- 自动选择直连或代理
export async function chatAssistantStream(perspective, messages, profile, resumeText, onChunk, onDone, onError) {
  const config = getUserApiConfig();
  const systemPrompt = getAssistantPrompt(perspective);

  let userContext = '';
  if (profile && Object.keys(profile).length > 0) {
    userContext = '\n\n以下是求职者的个人信息：\n' + buildUserProfileMsg(profile, resumeText);
  }

  if (canDirectCall()) {
    return chatAssistantDirect(config, systemPrompt, userContext, messages, onChunk, onDone, onError);
  } else {
    return chatAssistantProxy(systemPrompt, userContext, messages, onChunk, onDone, onError);
  }
}

// AI解析简历文本为结构化档案
export async function parseResumeToProfile(resumeText) {
  if (canDirectCall()) {
    const config = getUserApiConfig();
    const userMsg = `请从以下简历文本中提取结构化信息：\n\n${resumeText}`;
    const content = await directCallAI(config, PARSE_RESUME_PROMPT, userMsg);

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return {};
    } catch {
      return {};
    }
  }

  // 回退到 edge function
  const config = getUserApiConfig();
  const res = await fetch(`${API_BASE}/parse-resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resumeText,
      _apiKey: config.apiKey || undefined,
      _baseUrl: config.baseUrl || undefined,
      _model: config.model || undefined,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `解析失败 (HTTP ${res.status})` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}
