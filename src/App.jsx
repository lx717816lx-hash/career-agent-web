import { useState, useRef, useCallback, useEffect, Component } from 'react';
import {
  uploadResume, parseResumeToProfile, optimizeResume,
  matchJobs, deliveryPlan, startInterview, answerInterview,
  chatAssistantStream, matchJobsWithAggregation,
  generate8Questions, scoreVideoAnswer, scoreTextAnswer
} from './api';

// ============ 错误边界 ============
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <div className="error-boundary-icon">⚠️</div>
            <h2>页面发生错误</h2>
            <p>请尝试刷新页面，或检查控制台了解详情</p>
            <p className="error-detail">{this.state.error?.message}</p>
            <button className="action-btn" onClick={() => window.location.reload()} style={{width:'auto',display:'inline-block'}}>
              刷新页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============ 城市数据（省-市级联） ============
const CITY_DATA = {
  '全国': ['不限'],
  '北京': ['东城区','西城区','朝阳区','海淀区','丰台区','石景山区','通州区','大兴区','昌平区','顺义区','房山区','怀柔区','密云区','延庆区','平谷区','门头沟区'],
  '上海': ['黄浦区','徐汇区','长宁区','静安区','普陀区','虹口区','杨浦区','闵行区','宝山区','嘉定区','浦东新区','金山区','松江区','青浦区','奉贤区','崇明区'],
  '广东': ['广州','深圳','东莞','佛山','珠海','中山','惠州','汕头','江门','湛江','茂名','肇庆','揭阳','清远','韶关','梅州','潮州','汕尾','河源','阳江','云浮'],
  '浙江': ['杭州','宁波','温州','嘉兴','湖州','绍兴','金华','衢州','舟山','台州','丽水'],
  '江苏': ['南京','苏州','无锡','常州','南通','徐州','扬州','镇江','泰州','盐城','淮安','连云港','宿迁'],
  '四川': ['成都','绵阳','德阳','宜宾','南充','泸州','达州','乐山','自贡','眉山','内江','遂宁','广安','攀枝花','广元','资阳','雅安','巴中'],
  '湖北': ['武汉','襄阳','宜昌','荆州','黄冈','十堰','孝感','荆门','黄石','咸宁','鄂州','随州','恩施'],
  '湖南': ['长沙','株洲','湘潭','衡阳','岳阳','常德','益阳','娄底','邵阳','郴州','永州','怀化','张家界','湘西'],
  '山东': ['济南','青岛','烟台','潍坊','临沂','淄博','济宁','泰安','威海','日照','德州','聊城','滨州','菏泽','枣庄','东营'],
  '福建': ['福州','厦门','泉州','漳州','龙岩','三明','南平','莆田','宁德'],
  '河南': ['郑州','洛阳','开封','南阳','许昌','新乡','周口','信阳','商丘','安阳','平顶山','驻马店','焦作','漯河','濮阳','三门峡','鹤壁','济源'],
  '安徽': ['合肥','芜湖','马鞍山','蚌埠','安庆','阜阳','滁州','宿州','六安','亳州','宣城','淮南','淮北','铜陵','池州','黄山'],
  '河北': ['石家庄','唐山','保定','邯郸','廊坊','沧州','邢台','秦皇岛','张家口','衡水','承德'],
  '陕西': ['西安','咸阳','宝鸡','渭南','榆林','延安','汉中','安康','商洛','铜川'],
  '辽宁': ['沈阳','大连','鞍山','营口','锦州','抚顺','丹东','盘锦','葫芦岛','本溪','朝阳','辽阳','铁岭','阜新'],
  '江西': ['南昌','九江','赣州','上饶','宜春','吉安','抚州','景德镇','萍乡','新余','鹰潭'],
  '广西': ['南宁','柳州','桂林','玉林','北海','梧州','百色','钦州','贵港','河池','防城港','贺州','来宾','崇左'],
  '山西': ['太原','大同','临汾','运城','长治','晋中','晋城','吕梁','朔州','忻州','阳泉'],
  '云南': ['昆明','曲靖','玉溪','大理','丽江','红河','昭通','西双版纳','保山','楚雄','文山','普洱','德宏','临沧','怒江','迪庆'],
  '贵州': ['贵阳','遵义','毕节','六盘水','黔东南','黔南','黔西南','铜仁','安顺'],
  '黑龙江': ['哈尔滨','大庆','齐齐哈尔','牡丹江','佳木斯','绥化','鸡西','黑河','伊春','双鸭山','鹤岗','七台河','大兴安岭'],
  '吉林': ['长春','吉林','四平','通化','白山','辽源','白城','松原','延边'],
  '甘肃': ['兰州','天水','白银','武威','庆阳','平凉','酒泉','张掖','陇南','定西','金昌','嘉峪关','临夏','甘南'],
  '海南': ['海口','三亚','儋州','三沙'],
  '内蒙古': ['呼和浩特','包头','鄂尔多斯','赤峰','通辽','呼伦贝尔','巴彦淖尔','乌兰察布','乌海','兴安','锡林郭勒','阿拉善'],
  '新疆': ['乌鲁木齐','克拉玛依','石河子','喀什','阿克苏','伊犁','昌吉','巴音郭楞','博尔塔拉','塔城','哈密','吐鲁番','和田','阿勒泰','克孜勒苏'],
  '宁夏': ['银川','石嘴山','吴忠','固原','中卫'],
  '青海': ['西宁','海东','海西','海南','海北','玉树','果洛','黄南'],
  '西藏': ['拉萨','日喀则','昌都','林芝','山南','那曲','阿里'],
  '台湾': ['台北','新北','高雄','台中','台南','桃园','新竹','基隆','嘉义','彰化','屏东','花莲','台东'],
  '香港': ['香港岛','九龙','新界'],
  '澳门': ['澳门半岛','氹仔','路环'],
};
const PROVINCES = Object.keys(CITY_DATA);

// 行业选项
const INDUSTRY_OPTIONS = [
  '互联网/IT/软件', '金融/银行/保险/证券', '房地产/建筑/物业',
  '教育/培训/科研', '医疗/医药/健康', '制造/工业/自动化',
  '零售/消费/电商', '传媒/广告/文化', '咨询/法律/专业服务',
  '能源/环保/化工', '物流/运输/交通', '政府/事业单位/非营利',
  '通信/电子/半导体', '汽车/机械/重工', '快消/耐消/贸易',
  '酒店/旅游/餐饮', '农业/林业/渔业', '其他',
];

// 岗位选项
const POSITION_OPTIONS = [
  '产品经理', '前端开发工程师', '后端开发工程师', '全栈开发工程师',
  '算法工程师', '数据分析师', '数据工程师', 'AI/机器学习工程师',
  '测试工程师', '运维/DevOps工程师', '安全工程师', '架构师',
  '运营经理/专员', '市场/品牌经理', '销售经理/代表', '客户经理',
  '人力资源专员/经理', '财务/审计/税务', '法务/合规',
  'UI/UX设计师', '视觉设计师', '交互设计师', '平面设计师',
  '管培生', '项目经理', '咨询顾问', '研究员/分析师',
  '新媒体运营', '内容运营/编辑', '商务拓展(BD)', '其他',
];

// 求职偏好选项
const PREFERENCE_OPTIONS = [
  '薪资优先', '成长空间优先', '稳定保障优先',
  '工作生活平衡', '行业前景优先', '大厂经验优先',
  '地域优先', '技术栈匹配优先', '团队文化优先',
];

// 技能掌握程度（非语言技能）
const SKILL_LEVELS = ['精通', '熟练', '掌握', '了解', '入门'];

// ============ 导航标签 ============
const TABS = [
  { key: 'home', label: '首页', icon: '🏠' },
  { key: 'profile', label: '个人档案', icon: '👤' },
  { key: 'recommend', label: '岗位推荐', icon: '🎯' },
  { key: 'resume', label: '简历优化', icon: '📄' },
  { key: 'interview', label: '模拟面试', icon: '💼' },
  { key: 'assistant', label: '招聘助手', icon: '🤖' },
];

// ============ 基本信息字段 ============
const BASIC_FIELDS = [
  { key: 'name', label: '姓名', placeholder: '请输入您的姓名' },
  { key: 'age', label: '年龄', placeholder: '如：22', type: 'number' },
  { key: 'gender', label: '性别', placeholder: '请选择', type: 'select', options: ['男', '女'] },
  { key: 'education', label: '学历', placeholder: '请选择', type: 'select',
    options: ['高中及以下', '大专', '本科', '硕士', '博士'] },
  { key: 'school', label: '学校', placeholder: '如：XX大学（985/211/双一流等）' },
  { key: 'major', label: '专业', placeholder: '如：计算机科学与技术' },
  { key: 'majorRanking', label: '专业排名', placeholder: '如：前10% / 3/120' },
  { key: 'applyEducation', label: '应聘学历', placeholder: '请选择', type: 'select',
    options: ['本科', '硕士', '博士', '不限'] },
  { key: 'jobType', label: '求职类型', placeholder: '请选择', type: 'select',
    options: ['实习', '校招', '社招'] },
];

// ============ 经历类型 ============
const EXPERIENCE_TYPES = [
  { key: 'campus', label: '校园经历', icon: '🎓', placeholder: '如：担任学生会主席，组织了XX活动...' },
  { key: 'work', label: '实习/工作经历', icon: '💼', placeholder: '如：负责XX系统的开发，使用React+Node.js...' },
  { key: 'project', label: '项目/科研经历', icon: '🔬', placeholder: '如：主导XX项目，实现了XX功能...' },
];

// ============ 技能分类 ============
const SKILL_CATEGORIES = [
  {
    key: 'language', label: '语言', icon: '🌍',
    options: [
      { value: 'cet4', label: '英语 CET-4' },
      { value: 'cet6', label: '英语 CET-6' },
      { value: 'ielts', label: '雅思 IELTS' },
      { value: 'toefl', label: '托福 TOEFL' },
      { value: 'gre', label: 'GRE' },
      { value: 'gmat', label: 'GMAT' },
      { value: 'jp_n1', label: '日语 N1' },
      { value: 'jp_n2', label: '日语 N2' },
      { value: 'kr_topik6', label: '韩语 TOPIK 6级' },
      { value: 'kr_topik5', label: '韩语 TOPIK 5级' },
      { value: 'fr_b2', label: '法语 B2' },
      { value: 'fr_c1', label: '法语 C1' },
      { value: 'de_b2', label: '德语 B2' },
      { value: 'de_c1', label: '德语 C1' },
      { value: 'es_b2', label: '西语 B2' },
      { value: 'other_lang', label: '其他语言' },
    ],
    scoreHints: {
      cet4: '满分710，及格425', cet6: '满分710，及格425',
      ielts: '满分9.0，如 7.0', toefl: '满分120，如 105',
      gre: '满分340+6，如 325+4', gmat: '满分800，如 720',
      jp_n1: '满分180，及格100', jp_n2: '满分180，及格90',
      kr_topik6: '满分300', kr_topik5: '满分300',
      fr_b2: '如：已通过', fr_c1: '如：已通过',
      de_b2: '如：已通过', de_c1: '如：已通过',
      es_b2: '如：已通过', other_lang: '请填写语言名称和分数',
    },
  },
  {
    key: 'computer', label: '计算机', icon: '💻',
    options: [
      { value: '计算机二级', label: '计算机二级' }, { value: '计算机三级', label: '计算机三级' },
      { value: '计算机四级', label: '计算机四级' },
      { value: 'Python', label: 'Python' }, { value: 'Java', label: 'Java' },
      { value: 'JavaScript', label: 'JavaScript' }, { value: 'C++', label: 'C++' },
      { value: 'C', label: 'C' }, { value: 'Go', label: 'Go' },
      { value: 'SQL', label: 'SQL' }, { value: 'React', label: 'React' },
      { value: 'Vue', label: 'Vue' }, { value: 'Node.js', label: 'Node.js' },
      { value: 'Docker', label: 'Docker' }, { value: 'Git', label: 'Git' },
      { value: 'Linux', label: 'Linux' }, { value: '数据分析', label: '数据分析' },
      { value: '机器学习', label: '机器学习' }, { value: 'other_comp', label: '其他' },
    ],
    scoreHints: {
      Python: '如：熟练/掌握/了解', Java: '如：熟练/掌握/了解',
      JavaScript: '如：熟练/掌握/了解', 'C++': '如：熟练/掌握/了解',
      C: '如：熟练/掌握/了解', Go: '如：熟练/掌握/了解',
      SQL: '如：熟练/掌握/了解', React: '如：熟练/掌握/了解',
      Vue: '如：熟练/掌握/了解', 'Node.js': '如：熟练/掌握/了解',
      Docker: '如：熟练/掌握/了解', Git: '如：熟练/掌握/了解',
      Linux: '如：熟练/掌握/了解', 数据分析: '如：熟练/掌握/了解',
      机器学习: '如：熟练/掌握/了解',
      '计算机二级': '如：合格/良好/优秀', '计算机三级': '如：合格/良好/优秀',
      '计算机四级': '如：合格/良好/优秀',
      other_comp: '请填写技能名称和掌握程度',
    },
  },
  {
    key: 'newmedia', label: '新媒体', icon: '📱',
    options: [
      { value: '公众号运营', label: '公众号运营' }, { value: '短视频剪辑', label: '短视频剪辑' },
      { value: 'PS/PR', label: 'PS/PR' }, { value: '文案策划', label: '文案策划' },
      { value: '数据复盘', label: '数据复盘' }, { value: '小红书运营', label: '小红书运营' },
      { value: '抖音运营', label: '抖音运营' }, { value: 'B站运营', label: 'B站运营' },
      { value: 'other_media', label: '其他' },
    ],
    scoreHints: {
      '公众号运营': '如：熟练/掌握', '短视频剪辑': '如：熟练/掌握',
      'PS/PR': '如：熟练/掌握', '文案策划': '如：熟练/掌握',
      '数据复盘': '如：熟练/掌握', '小红书运营': '如：熟练/掌握',
      '抖音运营': '如：熟练/掌握', 'B站运营': '如：熟练/掌握',
      other_media: '请填写技能名称和掌握程度',
    },
  },
  {
    key: 'design', label: '设计', icon: '🎨',
    options: [
      { value: 'Figma', label: 'Figma' }, { value: 'Sketch', label: 'Sketch' },
      { value: 'Photoshop', label: 'Photoshop' }, { value: 'Illustrator', label: 'Illustrator' },
      { value: 'UI设计', label: 'UI设计' }, { value: '交互设计', label: '交互设计' },
      { value: '视觉设计', label: '视觉设计' }, { value: 'other_design', label: '其他' },
    ],
    scoreHints: {
      Figma: '如：熟练/掌握', Sketch: '如：熟练/掌握',
      Photoshop: '如：熟练/掌握', Illustrator: '如：熟练/掌握',
      UI设计: '如：熟练/掌握', 交互设计: '如：熟练/掌握',
      视觉设计: '如：熟练/掌握', other_design: '请填写技能名称和掌握程度',
    },
  },
  {
    key: 'finance', label: '金融/财会', icon: '📊',
    options: [
      { value: '财务分析', label: '财务分析' }, { value: 'Excel建模', label: 'Excel建模' },
      { value: 'Wind', label: 'Wind' }, { value: 'Bloomberg', label: 'Bloomberg' },
      { value: '审计', label: '审计' }, { value: '税务', label: '税务' },
      { value: '投资分析', label: '投资分析' }, { value: 'other_fin', label: '其他' },
    ],
    scoreHints: {
      财务分析: '如：熟练/掌握', Excel建模: '如：熟练/掌握',
      Wind: '如：熟练/掌握', Bloomberg: '如：熟练/掌握',
      审计: '如：熟练/掌握', 税务: '如：熟练/掌握',
      投资分析: '如：熟练/掌握', other_fin: '请填写技能名称和掌握程度',
    },
  },
  {
    key: 'other', label: '其他', icon: '🔧',
    options: [
      { value: 'other_skill', label: '自定义输入' },
    ],
    scoreHints: {
      other_skill: '请填写技能名称和掌握程度',
    },
  },
];

// ============ 初始状态工厂 ============
function createEmptyExperience() {
  return { startTime: '', endTime: '', organization: '', role: '', content: '' };
}

function createEmptySkillItem() {
  return { name: '', level: '' };
}

function createEmptyProfile() {
  const exp = {};
  for (const t of EXPERIENCE_TYPES) {
    exp[t.key] = [createEmptyExperience()];
  }
  const skills = {};
  for (const cat of SKILL_CATEGORIES) {
    skills[cat.key] = [];
  }
  return {
    name: '', age: '', gender: '',
    education: '', school: '', major: '',
    majorRanking: '', applyEducation: '', jobType: '',
    cities: [],    // 多选城市 ["北京-朝阳区", "上海-浦东新区"]
    industries: [], // 多选行业
    positions: [],  // 多选岗位
    preferences: [], // 多选偏好
    city: '',       // 兼容旧字段（字符串形式，如"北京/上海"）
    industry: '',
    position: '',
    preference: '',
    honors: [{ time: '', award: '' }],
    experiences: exp,
    skills,
  };
}

// ============ 档案完整度计算 ============
function calcProfileCompletion(profile, resumeText) {
  let filled = 0;
  const total = BASIC_FIELDS.length + 1 + 3 + 1 + 1; // 基本字段 + 城市 + 3类经历 + 技能 + 简历
  for (const f of BASIC_FIELDS) {
    if (f.type === 'select' || f.key === 'age') {
      if (profile[f.key] && String(profile[f.key]).trim()) filled++;
    } else if (profile[f.key] && profile[f.key].trim) {
      if (profile[f.key].trim()) filled++;
    }
  }
  // 城市多选
  if ((profile.cities && profile.cities.length > 0) || (profile.city && profile.city.trim())) filled++;
  // 检查经历
  if (profile.experiences) {
    for (const t of EXPERIENCE_TYPES) {
      const items = profile.experiences[t.key] || [];
      if (items.some(e => e.organization?.trim() || e.content?.trim())) filled++;
    }
  }
  // 检查技能
  if (profile.skills) {
    const hasSkill = Object.values(profile.skills).some(items => items && items.length > 0);
    if (hasSkill) filled++;
  }
  if (resumeText) filled++;
  return Math.round((filled / total) * 100);
}

// ============ 主应用 ============
export default function App() {
  const [showCover, setShowCover] = useState(true);
  const [coverExiting, setCoverExiting] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [profile, setProfile] = useState(createEmptyProfile());
  const [resumeText, setResumeText] = useState('');
  const [resumeFilename, setResumeFilename] = useState('');
  const [jd, setJd] = useState({ companyName: '', positionName: '', responsibilities: '', requirements: '' });

  // 各模块独立的 AI 状态
  const [recommendResult, setRecommendResult] = useState('');
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [recommendError, setRecommendError] = useState('');
  const [recommendMode, setRecommendMode] = useState(''); // 'match' | 'aggregation'

  const [resumeResult, setResumeResult] = useState('');
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState('');

  const [interviewResult, setInterviewResult] = useState('');
  const [interviewLoading, setInterviewLoading] = useState(false);
  const [interviewError, setInterviewError] = useState('');

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [parseFilling, setParseFilling] = useState(false);
  const [matchScore, setMatchScore] = useState(null); // { score, level, summary }
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(localStorage.getItem('ai_api_key') || '');
  const [apiBaseUrl, setApiBaseUrl] = useState(localStorage.getItem('ai_base_url') || 'https://api.deepseek.com/v1');
  const [apiModel, setApiModel] = useState(localStorage.getItem('ai_model') || 'deepseek-chat');
  // STT（语音转文字）配置
  const [sttApiKey, setSttApiKey] = useState(localStorage.getItem('stt_api_key') || '');
  const [sttBaseUrl, setSttBaseUrl] = useState(localStorage.getItem('stt_base_url') || 'https://api.openai.com/v1');
  const [sttModel, setSttModel] = useState(localStorage.getItem('stt_model') || 'whisper-1');

  // ==================== 个人档案操作函数 ====================
  // 荣誉奖项
  const addHonor = useCallback(() => {
    setProfile(prev => ({ ...prev, honors: [...(prev.honors || [{ time: '', award: '' }]), { time: '', award: '' }] }));
  }, []);
  const removeHonor = useCallback((idx) => {
    setProfile(prev => {
      const honors = [...(prev.honors || [])];
      if (honors.length > 1) honors.splice(idx, 1);
      return { ...prev, honors };
    });
  }, []);
  const updateHonor = useCallback((idx, field, value) => {
    setProfile(prev => {
      const honors = [...(prev.honors || [])];
      honors[idx] = { ...honors[idx], [field]: value };
      return { ...prev, honors };
    });
  }, []);

  // 经历
  const addExperience = useCallback((typeKey) => {
    setProfile(prev => ({
      ...prev,
      experiences: {
        ...prev.experiences,
        [typeKey]: [...(prev.experiences?.[typeKey] || []), createEmptyExperience()],
      },
    }));
  }, []);
  const removeExperience = useCallback((typeKey, idx) => {
    setProfile(prev => {
      const items = [...(prev.experiences?.[typeKey] || [])];
      if (items.length > 1) items.splice(idx, 1);
      return { ...prev, experiences: { ...prev.experiences, [typeKey]: items } };
    });
  }, []);
  const updateExperience = useCallback((typeKey, idx, field, value) => {
    setProfile(prev => {
      const items = [...(prev.experiences?.[typeKey] || [])];
      items[idx] = { ...items[idx], [field]: value };
      return { ...prev, experiences: { ...prev.experiences, [typeKey]: items } };
    });
  }, []);

  // 技能
  const addSkillItem = useCallback((catKey) => {
    setProfile(prev => ({
      ...prev,
      skills: {
        ...prev.skills,
        [catKey]: [...(prev.skills?.[catKey] || []), createEmptySkillItem()],
      },
    }));
  }, []);
  const removeSkillItem = useCallback((catKey, idx) => {
    setProfile(prev => {
      const items = [...(prev.skills?.[catKey] || [])];
      items.splice(idx, 1);
      return { ...prev, skills: { ...prev.skills, [catKey]: items } };
    });
  }, []);
  const updateSkillItem = useCallback((catKey, idx, field, value) => {
    setProfile(prev => {
      const items = [...(prev.skills?.[catKey] || [])];
      items[idx] = { ...items[idx], [field]: value };
      return { ...prev, skills: { ...prev.skills, [catKey]: items } };
    });
  }, []);

  // ==================== 新版模拟面试状态 ====================
  const [ivMode, setIvMode] = useState('');       // '' | 'video'
  const [ivStep, setIvStep] = useState('select'); // select|prepare|loading|ready|answering|scoring|summary
  const [ivJd, setIvJd] = useState('');                         // 用户输入的岗位JD
  const [ivQuestions, setIvQuestions] = useState([]);           // 8题
  const [ivQIndex, setIvQIndex] = useState(0);
  const [ivCurrentQ, setIvCurrentQ] = useState('');
  const [ivAnswer, setIvAnswer] = useState('');
  const [ivScores, setIvScores] = useState([]);
  const [ivFeedback, setIvFeedback] = useState(null);
  const [ivSummary, setIvSummary] = useState('');

  // 视频相关
  const [videoStream, setVideoStream] = useState(null);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [speechText, setSpeechText] = useState('');
  const [speechSupported, setSpeechSupported] = useState(false);
  const videoRef = useRef(null);
  const recognitionRef = useRef(null);
  const streamRef = useRef(null);
  const isRecordingRef = useRef(false);
  const expressionRef = useRef({ expression: 'neutral', confidence: 0, score: 5 });
  // MediaRecorder 通用录音（所有系统可用）
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [isMediaRecording, setIsMediaRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [mediaRecordingSupported, setMediaRecordingSupported] = useState(false);

  // 招聘助手状态
  const [assistantMessages, setAssistantMessages] = useState([]);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantPerspective, setAssistantPerspective] = useState('');
  const [editingIndex, setEditingIndex] = useState(-1);
  const [editContent, setEditContent] = useState('');
  const [regeneratingIndex, setRegeneratingIndex] = useState(-1);
  const [selectedProvince, setSelectedProvince] = useState('');

  const resultRef = useRef(null);
  const chatEndRef = useRef(null);

  // 将技能序列化为文本
  const skillsSummary = (() => {
    if (!profile.skills) return '';
    let parts = [];
    for (const cat of SKILL_CATEGORIES) {
      const items = profile.skills[cat.key] || [];
      if (items.length > 0) {
        const desc = items.map(i => i.level ? `${i.name} ${i.level}` : i.name).join('、');
        parts.push(`${cat.label}：${desc}`);
      }
    }
    return parts.join('；');
  })();

  // 将经历序列化为文本
  const experiencesSummary = (() => {
    if (!profile.experiences) return '';
    let parts = [];
    for (const t of EXPERIENCE_TYPES) {
      const items = (profile.experiences[t.key] || []).filter(e => e.organization?.trim() || e.content?.trim());
      if (items.length > 0) {
        parts.push(`【${t.label}】`);
        items.forEach((e, i) => {
          const time = (e.startTime || e.endTime) ? `${e.startTime}${e.startTime && e.endTime ? '~' : ''}${e.endTime}` : '';
          const roleStr = e.role?.trim() ? `[${e.role}] ` : '';
          parts.push(`  ${i + 1}. ${time ? time + ' | ' : ''}${roleStr}${e.organization || '未填写组织'}${e.content ? '：' + e.content : ''}`);
        });
      }
    }
    return parts.join('\n');
  })();

  // 合并后的 profile（含技能文本），供后端使用
  const honorsSummary = (profile.honors || [])
    .filter(h => h.award?.trim())
    .map(h => h.time ? `${h.time} ${h.award}` : h.award)
    .join('、');

  const fullProfile = {
    ...profile,
    honorsText: honorsSummary,
    skillsText: skillsSummary,
    language: skillsSummary,
    campusExp: experiencesSummary,
    workExp: experiencesSummary,
    projectExp: experiencesSummary,
    computer: (profile.skills?.computer || []).map(i => i.level ? `${i.name} ${i.level}` : i.name).join('、'),
    // 将数组字段转为字符串用于AI提示词
    citiesText: (profile.cities || []).join('、') || profile.city || '',
    industriesText: (profile.industries || []).join('、') || profile.industry || '',
    positionsText: (profile.positions || []).join('、') || profile.position || '',
    preferencesText: (profile.preferences || []).join('、') || profile.preference || '',
  };

  // 自动滚动
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ivScores, ivFeedback]);

  // ============ 新版面试：摄像头 + 语音 ============

// 检测语音识别支持（Web Speech API + MediaRecorder 双重方案）
const [speechError, setSpeechError] = useState('');
useEffect(() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const MR = window.MediaRecorder;
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (MR) {
    setMediaRecordingSupported(true);
    // MediaRecorder 在所有系统上都可用，作为通用兜底
    if (!SR) {
      setSpeechSupported(false);
      setSpeechError(isIOS
        ? '🎤 本设备支持录音转文字！点击"开始录音"按钮，说完后点击"停止并转文字"即可'
        : '🎤 您的浏览器支持通用录音转文字功能');
    } else if (isIOS) {
      setSpeechSupported(false);
      setSpeechError('🎤 本设备支持录音转文字！点击"开始录音"按钮开始');
    } else {
      setSpeechSupported(true);
      setSpeechError('');
    }
  } else if (!SR) {
    setSpeechSupported(false);
    setMediaRecordingSupported(false);
    setSpeechError('您的浏览器不支持语音功能，请使用下方文字输入框手动回答');
  } else {
    setSpeechSupported(true);
    setMediaRecordingSupported(false);
    setSpeechError('');
  }
}, []);

// 视频流绑定 - 当stream或面试步骤改变时重新绑定
useEffect(() => {
  if (videoRef.current && videoStream) {
    videoRef.current.srcObject = videoStream;
    videoRef.current.play().catch(e => console.warn('视频播放失败:', e));
  }
}, [videoStream, ivStep]);

// 手机端检测
const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);

// 移动端友好的摄像头约束：先用 relaxed 参数尝试，失败则降级
const getMobileConstraints = () => {
  if (isMobile) {
    return { video: { facingMode: 'user' }, audio: true };
  }
  return { video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: true };
};

// 开启摄像头（含降级重试）
const tryGetUserMedia = async (preferAudio = true) => {
  const constraints = isMobile
    ? [{ video: { facingMode: 'user' }, audio: preferAudio }]
    : [
        { video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: preferAudio },
        { video: { facingMode: 'user' }, audio: preferAudio },
      ];
  let lastErr = null;
  for (const c of constraints) {
    try {
      return await navigator.mediaDevices.getUserMedia(c);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
};

const [camError, setCamError] = useState('');
const startCamera = useCallback(async () => {
  setCamError('');
  try {
    const stream = await tryGetUserMedia(true);
    streamRef.current = stream;
    setVideoStream(stream);
    setVideoEnabled(true);
  } catch (err) {
    setVideoEnabled(false);
    if (isMobile) {
      if (err.name === 'NotAllowedError')
        setCamError('⚠️ 权限被拒：请在浏览器设置/手机设置中开启相机和麦克风权限，然后刷新页面重试。Safari用户请前往 设置 > Safari > 相机/麦克风');
      else if (err.name === 'NotFoundError')
        setCamError('⚠️ 未检测到摄像头，请确认手机已连接摄像头硬件');
      else
        setCamError('⚠️ 摄像头不可用: ' + (err.message || '请使用Chrome/Edge浏览器，并确保网站使用HTTPS'));
    } else {
      if (err.name === 'NotAllowedError') setCamError('摄像头/麦克风权限被拒绝，请在浏览器设置中允许访问');
      else if (err.name === 'NotFoundError') setCamError('未检测到摄像头或麦克风设备');
      else if (err.name === 'NotReadableError') setCamError('摄像头或麦克风正被其他应用占用');
      else setCamError('无法访问摄像头: ' + (err.message || '未知错误'));
    }
  }
}, []);

// 停止摄像头
const stopCamera = useCallback(() => {
  stopSpeech();
  if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  setVideoStream(null); setVideoEnabled(false);
}, []);

// 停止语音（Web Speech API）
const stopSpeech = useCallback(() => {
  if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} recognitionRef.current = null; }
  if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
    mediaRecorderRef.current.stop();
  }
  isRecordingRef.current = false; setIsRecording(false); setIsMediaRecording(false);
}, []);

// ============ MediaRecorder 通用录音（所有系统可用） ============

// 获取用户配置的 STT API
const getSttConfig = () => ({
  apiKey: localStorage.getItem('stt_api_key') || '',
  baseUrl: localStorage.getItem('stt_base_url') || 'https://api.openai.com/v1',
  model: localStorage.getItem('stt_model') || 'whisper-1',
});

// 开始 MediaRecorder 录音
const startMediaRecording = useCallback(async () => {
  if (!window.MediaRecorder) { setSpeechError('浏览器不支持录音功能'); return; }
  setSpeechError('');
  try {
    // 获取麦克风音频流
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    // 选择最佳音频格式（兼容各浏览器）
    const mimeType = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/wav',
    ].find(t => MediaRecorder.isTypeSupported(t)) || 'audio/webm';

    const recorder = new MediaRecorder(stream, { mimeType });
    audioChunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      await transcribeAudio(audioBlob);
    };

    recorder.onerror = () => {
      setIsMediaRecording(false);
      isRecordingRef.current = false;
      setIsRecording(false);
      setSpeechError('录音失败，请重试');
    };

    mediaRecorderRef.current = recorder;
    recorder.start(250); // 每250ms收集一次数据块
    setIsMediaRecording(true);
    isRecordingRef.current = true;
    setIsRecording(true);
    console.log('MediaRecorder 录音已启动, mimeType:', mimeType);
  } catch (err) {
    console.error('MediaRecorder 启动失败:', err);
    if (err.name === 'NotAllowedError') {
      setSpeechError(isMobile ? '麦克风权限被拒：请在手机设置 > 浏览器中开启麦克风' : '麦克风权限被拒绝');
    } else {
      setSpeechError('无法访问麦克风: ' + (err.message || '未知错误'));
    }
  }
}, []);

// 停止 MediaRecorder 录音
const stopMediaRecording = useCallback(() => {
  if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
    mediaRecorderRef.current.stop();
    setIsMediaRecording(false);
    isRecordingRef.current = false;
    setIsRecording(false);
    setIsTranscribing(true);
  }
}, []);

// 将音频发送到 STT API 进行转写
const transcribeAudio = async (audioBlob) => {
  const config = getSttConfig();
  if (!config.apiKey) {
    setIsTranscribing(false);
    setSpeechError('⚠️ 未配置语音转文字 API。请在右上角 ⚙️ 设置中添加 STT API Key（支持 OpenAI Whisper 格式）');
    return;
  }
  try {
    const formData = new FormData();
    // 根据 mimeType 映射文件扩展名
    const extMap = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/wav': 'wav' };
    const ext = extMap[audioBlob.type] || 'webm';
    formData.append('file', audioBlob, `recording.${ext}`);
    formData.append('model', config.model);
    formData.append('language', 'zh');
    formData.append('response_format', 'json');

    const response = await fetch(`${config.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`STT API 错误 (${response.status}): ${errText}`);
    }

    const result = await response.json();
    const text = result.text || '';
    if (text.trim()) {
      setSpeechText(text);
      setIvAnswer(text);
    } else {
      setSpeechError('未识别到语音内容，请重新录音');
    }
  } catch (err) {
    console.error('语音转文字失败:', err);
    const msg = err.message || '未知错误';
    if (msg.includes('401') || msg.includes('403')) {
      setSpeechError('⚠️ STT API Key 无效，请在设置中检查');
    } else if (msg.includes('429')) {
      setSpeechError('⚠️ API 调用次数超限，请稍后再试');
    } else {
      setSpeechError('⚠️ 语音转文字失败: ' + msg);
    }
  } finally {
    setIsTranscribing(false);
  }
};

// 智能录音：优先 Web Speech API，不可用时用 MediaRecorder
const smartStartRecording = useCallback(() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (SR && !isIOS) {
    // Chrome/Edge/Android: 使用实时语音识别
    startSpeechRecognition();
  } else if (window.MediaRecorder) {
    // iOS/Firefox/其他: 使用通用录音
    setIvAnswer('');
    setSpeechText('');
    startMediaRecording();
  } else {
    setSpeechError('设备不支持语音功能，请使用下方文字输入框');
  }
}, [startSpeechRecognition, startMediaRecording]);

// 开始语音识别
const startSpeechRecognition = useCallback(() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { setSpeechError('浏览器不支持语音识别'); return; }
  if (recognitionRef.current) {
    // 如果已有实例在运行，先停止
    try { recognitionRef.current.stop(); } catch {}
    recognitionRef.current = null;
  }
  const r = new SR();
  r.lang = 'zh-CN';
  r.interimResults = true;
  r.continuous = true;
  r.maxAlternatives = 1;
  
  r.onstart = () => { console.log('语音识别已启动'); setIsRecording(true); isRecordingRef.current = true; setSpeechError(''); };
  r.onresult = (e) => { 
    let t = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      t += e.results[i][0].transcript;
    }
    if (t.trim()) {
      setSpeechText(t);
      setIvAnswer(t);
    }
  };
  let restartCount = 0;
  r.onerror = (e) => {
    console.warn('语音识别错误:', e.error, e.message);
    if (e.error === 'not-allowed') {
      setSpeechError(isMobile ? '麦克风权限被拒：请在手机 设置 > 浏览器 中开启麦克风，并用 HTTPS 访问本站' : '麦克风权限被拒绝，请在浏览器设置中允许');
    } else if (e.error === 'no-speech') {
      console.log('未检测到语音');
    } else if (e.error === 'network') {
      setSpeechError('语音识别网络错误：手机端需使用 HTTPS 安全连接，请将地址开头的 http 改为 https');
      // 网络错误不重启，直接停掉
      recognitionRef.current = null;
      isRecordingRef.current = false;
      setIsRecording(false);
      return;
    } else if (e.error === 'audio-capture') {
      setSpeechError('未检测到麦克风设备，请确认手机已授予麦克风权限');
    }
    // 限次重启（最多3次），避免无限循环
  };
  r.onend = () => {
    console.log('语音识别结束, isRecording=', isRecordingRef.current, 'restarts=', restartCount);
    if (isRecordingRef.current && recognitionRef.current === r && restartCount < 3) {
      restartCount++;
      setTimeout(() => {
        try { if (recognitionRef.current === r) { r.start(); console.log('语音识别重新启动 #' + restartCount); } }
        catch (e) { 
          console.warn('重新启动失败:', e);
          recognitionRef.current = null;
          isRecordingRef.current = false;
          setIsRecording(false);
          setSpeechError('语音识别异常中断，请手动点击"重新录音"');
        }
      }, 300);
    } else {
      recognitionRef.current = null;
      setIsRecording(false);
      if (restartCount >= 3) setSpeechError('语音识别多次中断，请检查网络环境后重新开始');
    }
  };
  
  recognitionRef.current = r;
  isRecordingRef.current = true;
  setIsRecording(true);
  try {
    r.start();
    console.log('语音识别开始请求成功');
  } catch (e) {
    console.error('语音识别启动失败:', e);
    recognitionRef.current = null;
    isRecordingRef.current = false;
    setIsRecording(false);
    setSpeechError('语音识别启动失败: ' + (e.message || '未知错误'));
  }
}, []);

// ============ 流式输出辅助 ============
const handleStreamFor = useCallback((setResultFn, setLoadingFn, setErrorFn) => {
    let accumulated = '';
    return {
      onChunk: (delta) => { accumulated += delta; setResultFn(accumulated); },
      onDone: (full) => { setResultFn(full || accumulated); setLoadingFn(false); },
      onError: (err) => { setErrorFn(err); setLoadingFn(false); },
    };
  }, []);

  // ============ 简历上传 ============
  const handleUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'docx', 'txt'].includes(ext)) { setUploadError('仅支持 PDF、DOCX、TXT 格式'); return; }
    setUploading(true); setUploadError('');
    try {
      const data = await uploadResume(file); setResumeText(data.text); setResumeFilename(data.filename);
      setParseFilling(true);
      try {
        const parsed = await parseResumeToProfile(data.text);
        if (parsed) setProfile(prev => mergeParsedProfile(prev, parsed));
      } catch (parseErr) {
        const localParsed = localParseResume(data.text);
        if (localParsed) setProfile(prev => mergeParsedProfile(prev, localParsed));
      }
      setParseFilling(false);
    } catch (err) { setUploadError(err.message); } finally { setUploading(false); }
  };

  // ============ 岗位推荐 ============
  const handleRecommend = () => {
    setRecommendLoading(true); setRecommendError(''); setRecommendResult(''); setRecommendMode('match'); setMatchScore(null);
    const h = handleStreamFor(setRecommendResult, setRecommendLoading, setRecommendError);
    matchJobs(fullProfile, resumeText, null, h.onChunk, h.onDone, h.onError);
  };
  const handleAggregation = () => {
    setRecommendLoading(true); setRecommendError(''); setRecommendResult(''); setRecommendMode('aggregation'); setMatchScore(null);
    const h = handleStreamFor(setRecommendResult, setRecommendLoading, setRecommendError);
    matchJobsWithAggregation(fullProfile, resumeText, h.onChunk, h.onDone, h.onError);
  };
  const handleDeliveryPlan = () => {
    setRecommendLoading(true); setRecommendError('');
    const h = handleStreamFor(setRecommendResult, setRecommendLoading, setRecommendError);
    deliveryPlan(fullProfile, resumeText, recommendResult || null, h.onChunk, h.onDone, h.onError);
  };

  // ============ 简历优化 ============
  const handleOptimizeResume = () => {
    setResumeLoading(true); setResumeError(''); setResumeResult('');
    const h = handleStreamFor(setResumeResult, setResumeLoading, setResumeError);
    optimizeResume(fullProfile, resumeText, jd, h.onChunk, h.onDone, h.onError);
  };

// ============ 面试流程控制 ============

// 1. 选择模式 → 进入准备页
const handleSelectMode = (mode) => {
  setIvMode(mode); setIvStep('prepare'); setIvJd(''); setIvQuestions([]); setIvQIndex(0);
  setIvScores([]); setIvFeedback(null); setIvAnswer(''); setSpeechText(''); setIvSummary('');
};

// 单独开启摄像头（准备页使用）
const startCameraSep = async () => {
  setCamError('');
  try {
    const stream = await tryGetUserMedia(true);
    streamRef.current = stream; setVideoStream(stream); setVideoEnabled(true);
  } catch (err) {
    setVideoEnabled(false);
    if (isMobile) {
      if (err.name === 'NotAllowedError')
        setCamError('⚠️ 权限被拒：请前往手机 设置 > 浏览器/Safari 中开启相机和麦克风权限，然后刷新页面');
      else if (err.name === 'NotFoundError')
        setCamError('⚠️ 未检测到摄像头设备');
      else
        setCamError('⚠️ 摄像头不可用: ' + (err.message || '请确保使用HTTPS访问'));
    } else {
      if (err.name === 'NotAllowedError') setCamError('摄像头/麦克风权限被拒绝，请在浏览器设置中允许访问后刷新页面重试');
      else if (err.name === 'NotFoundError') setCamError('未检测到摄像头或麦克风设备');
      else if (err.name === 'NotReadableError') setCamError('摄像头或麦克风正被其他应用占用，请关闭其他应用后重试');
      else setCamError('无法访问摄像头: ' + (err.message || '请检查设备连接'));
    }
  }
};

// 2. 准备页：验证JD → 确保摄像头已开（视频模式）→ AI出题 → 进入ready
const handlePrepare = async () => {
  if (!ivJd.trim()) { alert('请先输入岗位JD（职位描述）'); return; }
  if (ivMode === 'video' && !videoEnabled) { alert('视频面试需要开启摄像头和麦克风！请点击"开启摄像头"按钮'); return; }
  setIvStep('loading');
  const jdData = { positionName: '目标岗位', responsibilities: ivJd, requirements: ivJd };
  try {
    const qs = await generate8Questions(fullProfile, resumeText, jdData);
    const valid = Array.isArray(qs) && qs.length >= 8 ? qs : [
      '请做一下自我介绍，重点介绍与岗位相关的背景和优势。','请详细介绍你最有代表性的一个项目或实习经历（使用STAR法则）。','在这个项目中你遇到了什么技术或协作挑战？你是如何解决的？',
      '根据JD要求，你认为自己应聘这个岗位最大的优势是什么？','请举例说明你如何与团队协作完成一个复杂任务。','假设工作中遇到和领导在技术方案上有分歧，你会怎么处理？',
      '你对未来3-5年的职业规划是什么，这个岗位如何融入你的规划？','你对这个岗位和公司有什么想了解的？'];
    setIvQuestions(valid.slice(0,8)); setIvCurrentQ(valid[0]); setIvStep('ready');
  } catch {
    setIvQuestions(['请做一下自我介绍，重点介绍与岗位相关的背景。']); setIvCurrentQ('请做一下自我介绍，重点介绍与岗位相关的背景。'); setIvStep('ready');
  }
};

// 3. 准备完成 → 开始答题
const handleReady = () => {
  setIvStep('answering'); setIvAnswer(''); setSpeechText('');
  if (ivMode === 'video') { smartStartRecording(); }
};

// 4. 回答结束，AI评分
const handleEndAnswer = async () => {
  stopSpeech(); setIsRecording(false);
  
  // 检查回答是否为空
  const answerText = (ivAnswer || '').trim();
  if (!answerText) {
    setIvFeedback({
      score: 0, passed: false,
      contentScore: 0, expressionScore: 0,
      feedback: '⚠️ 未检测到任何回答内容。请在视频面试时对准麦克风清晰说话，或在文字模式下输入回答。',
      optimizedAnswer: '请先尝试回答本题，获取AI反馈后再查看优化示例。'
    });
    setIvStep('scoring');
    return;
  }
  
  // 检查回答是否太短
  if (answerText.length < 15) {
    setIvFeedback({
      score: 10, passed: false,
      contentScore: 10, expressionScore: 0,
      feedback: '⚠️ 回答内容过短（不足15字），无法有效评估。请根据STAR法则详细展开回答，包含具体案例和量化数据。',
      optimizedAnswer: '建议扩展回答：详细说明背景(Situation)、任务(Task)、行动(Action)、结果(Result)，并包含具体数据和案例。'
    });
    setIvStep('scoring');
    return;
  }
  
  setIvStep('scoring'); setIvFeedback(null);
  try {
    let result;
    if (ivMode === 'video') {
      // 视频模式：只传递提示说明当前无表情分析数据，AI根据内容评分
      // 不再发送随机伪造的表情数据
      result = await scoreVideoAnswer(ivCurrentQ, answerText, null);
    } else {
      result = await scoreTextAnswer(ivCurrentQ, answerText);
    }
    result.passed = (result.score || 0) >= 80;
    setIvFeedback(result);
    const newScores = [...ivScores, { q: ivCurrentQ, a: answerText, ...result, qIndex: ivQIndex }];
    setIvScores(newScores);
    // 8题都通过则进入总结
    if (result.passed && ivQIndex >= 7) {
      setTimeout(() => setIvStep('summary'), 500);
    }
  } catch (err) {
    setIvFeedback({ score: 0, passed: false, feedback: '评分过程出错：' + err.message, contentScore: 0, expressionScore: 0, optimizedAnswer: '' });
  }
};

// 5. 下一题
const handleNextQ = () => {
  const nextIdx = ivQIndex + 1;
  if (nextIdx >= 8) { setIvStep('summary'); return; }
  setIvQIndex(nextIdx); setIvCurrentQ(ivQuestions[nextIdx]);
  setIvAnswer(''); setSpeechText(''); setIvFeedback(null); setIvStep('ready');
};

// 6. 重试当前题
const handleRetry = () => {
  setIvAnswer(''); setSpeechText(''); setIvFeedback(null); setIvStep('ready');
};

// 7. 生成总结（已废弃，summary页直接展示）
const handleSummary = () => { setIvStep('summary'); };

  // 复制结果
  const copyResult = (text) => {
    navigator.clipboard.writeText(text).then(() => alert('已复制到剪贴板'));
  };

  // ============ 渲染：个人档案模块 ============
  const renderProfile = () => {
    const completion = calcProfileCompletion(profile, resumeText);

    const toggleCity = (fullName) => {
      setProfile(prev => {
        const cities = [...(prev.cities || [])];
        const idx = cities.indexOf(fullName);
        if (idx >= 0) cities.splice(idx, 1);
        else cities.push(fullName);
        return { ...prev, cities, city: cities.join('、') };
      });
    };

    const toggleArray = (key) => (val) => {
      setProfile(prev => {
        const arr = [...(prev[key] || [])];
        const idx = arr.indexOf(val);
        if (idx >= 0) arr.splice(idx, 1);
        else arr.push(val);
        return { ...prev, [key]: arr, [key.replace(/s$/,'')]: arr.join('、') };
      });
    };

    return (
      <div className="profile-page">
        <div className="profile-header">
          <h2>👤 个人档案</h2>
          <div className="profile-completion">
            <div className="completion-bar">
              <div className="completion-fill" style={{ width: `${completion}%` }}></div>
            </div>
            <span>档案完整度 {completion}%</span>
          </div>
        </div>
        <p className="form-hint">填写一次，所有功能模块自动使用。上传简历后 AI 会自动帮你填入档案。</p>

        {/* 基本信息 */}
        <div className="profile-section">
          <h3>📋 基本信息</h3>
          <div className="basic-info-grid">
            {BASIC_FIELDS.map(f => (
              <div key={f.key} className="form-field">
                <label>{f.label}</label>
                {f.type === 'select' ? (
                  <select value={profile[f.key] || ''} onChange={e => setProfile(prev => ({ ...prev, [f.key]: e.target.value }))}>
                    <option value="">{f.placeholder}</option>
                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.type === 'number' ? (
                  <input type="number" placeholder={f.placeholder} value={profile[f.key] || ''}
                    onChange={e => setProfile(prev => ({ ...prev, [f.key]: e.target.value }))} min="16" max="60" />
                ) : (
                  <input type="text" placeholder={f.placeholder} value={profile[f.key] || ''}
                    onChange={e => setProfile(prev => ({ ...prev, [f.key]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 求职城市 - 省市级联多选 */}
        <div className="profile-section">
          <h3>📍 求职城市（可多选）</h3>
          <div className="city-selector">
            <div className="form-field" style={{marginBottom: 8}}>
              <label>选择省份/地区</label>
              <select value={selectedProvince} onChange={e => setSelectedProvince(e.target.value)}>
                <option value="">请先选择省份</option>
                {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {selectedProvince && (
              <div className="city-chips">
                <p className="form-hint" style={{marginBottom: 8, width: '100%'}}>勾选目标城市（可多选）：</p>
                {CITY_DATA[selectedProvince].map(city => {
                  const fullName = selectedProvince === '全国' ? '全国' : `${selectedProvince}-${city}`;
                  const isSelected = (profile.cities || []).includes(fullName);
                  return (
                    <button key={city}
                      className={`chip-btn ${isSelected ? 'chip-selected' : ''}`}
                      onClick={() => toggleCity(fullName)}>
                      {isSelected ? '✓ ' : ''}{city}
                    </button>
                  );
                })}
              </div>
            )}
            {(profile.cities || []).length > 0 && (
              <div className="selected-tags" style={{marginTop: 12}}>
                <span className="tag-label">已选城市：</span>
                {(profile.cities || []).map(c => (
                  <span key={c} className="tag tag-removable" onClick={() => toggleCity(c)}>
                    {c} ✕
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 目标行业 - 多选 */}
        <div className="profile-section">
          <h3>🏭 目标行业（可多选）</h3>
          <div className="chip-grid">
            {INDUSTRY_OPTIONS.map(ind => {
              const isSelected = (profile.industries || []).includes(ind);
              return (
                <button key={ind}
                  className={`chip-btn ${isSelected ? 'chip-selected' : ''}`}
                  onClick={() => toggleArray('industries')(ind)}>
                  {isSelected ? '✓ ' : ''}{ind}
                </button>
              );
            })}
          </div>
        </div>

        {/* 目标岗位 - 多选 */}
        <div className="profile-section">
          <h3>🎯 目标岗位（可多选）</h3>
          <div className="chip-grid">
            {POSITION_OPTIONS.map(pos => {
              const isSelected = (profile.positions || []).includes(pos);
              return (
                <button key={pos}
                  className={`chip-btn ${isSelected ? 'chip-selected' : ''}`}
                  onClick={() => toggleArray('positions')(pos)}>
                  {isSelected ? '✓ ' : ''}{pos}
                </button>
              );
            })}
          </div>
        </div>

        {/* 求职偏好 - 多选 */}
        <div className="profile-section">
          <h3>💡 求职偏好（可多选）</h3>
          <div className="chip-grid">
            {PREFERENCE_OPTIONS.map(pref => {
              const isSelected = (profile.preferences || []).includes(pref);
              return (
                <button key={pref}
                  className={`chip-btn ${isSelected ? 'chip-selected' : ''}`}
                  onClick={() => toggleArray('preferences')(pref)}>
                  {isSelected ? '✓ ' : ''}{pref}
                </button>
              );
            })}
          </div>
        </div>

        {/* 荣誉奖项 */}
        <div className="profile-section">
          <h3>🏆 荣誉奖项</h3>
          <div className="honors-grid">
            {(profile.honors || [{ time: '', award: '' }]).map((h, idx) => (
              <div key={idx} className={`honor-card ${!h.award?.trim() && !h.time?.trim() ? 'empty' : ''}`}>
                <div className="honor-trophy">{h.award?.trim() ? '🏆' : '⭐'}</div>
                <div className="honor-card-info">
                  <input type="text" placeholder="获奖时间 如：2024.10" value={h.time}
                    onChange={e => updateHonor(idx, 'time', e.target.value)} />
                  <input type="text" placeholder="奖项名称 如：国家奖学金" value={h.award}
                    onChange={e => updateHonor(idx, 'award', e.target.value)} />
                </div>
                {(profile.honors || []).length > 1 && (
                  <button className="honor-remove-btn" onClick={() => removeHonor(idx)}>✕</button>
                )}
              </div>
            ))}
          </div>
          <button className="honor-add-btn" onClick={addHonor}>+ 添加奖项</button>
        </div>

        {/* 经历区 */}
        <div className="profile-section">
          <h3>📝 经历</h3>
          {EXPERIENCE_TYPES.map(t => (
            <div key={t.key} className="experience-group">
              <div className="exp-group-header">
                <span>{t.icon} {t.label}</span>
                <button className="exp-add-btn" onClick={() => addExperience(t.key)}>+ 添加</button>
              </div>
              {(profile.experiences?.[t.key] || [createEmptyExperience()]).map((exp, idx) => (
                <div key={idx} className="experience-item">
                  <div className="exp-time-row">
                    <input type="text" placeholder="开始时间 如：2024.03" value={exp.startTime}
                      onChange={e => updateExperience(t.key, idx, 'startTime', e.target.value)} />
                    <span className="exp-time-sep">~</span>
                    <input type="text" placeholder="结束时间 如：2024.06" value={exp.endTime}
                      onChange={e => updateExperience(t.key, idx, 'endTime', e.target.value)} />
                  </div>
                  <input type="text" placeholder="组织/公司/社团名称" value={exp.organization}
                    onChange={e => updateExperience(t.key, idx, 'organization', e.target.value)} className="exp-org-input" />
                  <input type="text" placeholder="职务/角色 如：学生会主席" value={exp.role || ''}
                    onChange={e => updateExperience(t.key, idx, 'role', e.target.value)} className="exp-role-input" />
                  <textarea placeholder={t.placeholder} value={exp.content} rows={2}
                    onChange={e => updateExperience(t.key, idx, 'content', e.target.value)} />
                  {(profile.experiences?.[t.key] || []).length > 1 && (
                    <button className="exp-remove-btn" onClick={() => removeExperience(t.key, idx)}>删除此条</button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* 技能区 */}
        <div className="profile-section">
          <h3>🛠️ 技能</h3>
          {SKILL_CATEGORIES.map(cat => (
            <div key={cat.key} className="skill-category">
              <div className="skill-cat-header">
                <span>{cat.icon} {cat.label}</span>
                <button className="exp-add-btn" onClick={() => addSkillItem(cat.key)}>+ 添加</button>
              </div>
              {(profile.skills?.[cat.key] || []).map((item, idx) => (
                <div key={idx} className="skill-row">
                  <select value={item.name} onChange={e => updateSkillItem(cat.key, idx, 'name', e.target.value)}>
                    <option value="">选择{cat.label}</option>
                    {cat.options.map(o => <option key={o.value} value={o.label}>{o.label}</option>)}
                  </select>
                  {/* 语言技能保留手动输入分数，其他技能用下拉选项 */}
                  {cat.key === 'language' ? (
                    <input type="text" placeholder={cat.scoreHints?.[Object.entries(cat.options).find(([_,o])=>o.label===item.name)?.[1]?.value] || '分数/等级'}
                      value={item.level} onChange={e => updateSkillItem(cat.key, idx, 'level', e.target.value)} />
                  ) : (
                    <select value={item.level} onChange={e => updateSkillItem(cat.key, idx, 'level', e.target.value)}>
                      <option value="">掌握程度</option>
                      {SKILL_LEVELS.map(lv => <option key={lv} value={lv}>{lv}</option>)}
                    </select>
                  )}
                  <button className="lang-remove-btn" onClick={() => removeSkillItem(cat.key, idx)}>✕</button>
                </div>
              ))}
              {(profile.skills?.[cat.key] || []).length === 0 && (
                <p className="skill-empty-hint">点击"+ 添加"添加{cat.label}技能</p>
              )}
            </div>
          ))}
        </div>

        {/* 简历上传 */}
        <div className="profile-section">
          <h3>📎 简历上传</h3>
          <p className="form-hint">支持 PDF、DOCX、TXT 格式。上传后 AI 会自动解析并填入档案。</p>
          <p className="form-warning">⚠️ 请勿上传包含身份证号、银行卡号等敏感信息的文件</p>
          <div className="upload-area">
            <input type="file" accept=".pdf,.docx,.txt" onChange={handleUpload} id="resume-file-profile" />
            <label htmlFor="resume-file-profile" className={`upload-label ${uploading ? 'uploading' : ''}`}>
              {uploading ? '⏳ 解析中...' : '📂 点击上传简历'}
            </label>
            {resumeFilename && <span className="upload-success">✅ 已解析：{resumeFilename}</span>}
          </div>
          {uploadError && <div className="error-msg" style={{marginTop: 8}}>❌ {uploadError}</div>}
          {parseFilling && (
            <div className="parse-filling-hint">
              <span className="spinner"></span> AI 正在解析简历并自动填入档案...
            </div>
          )}
          {resumeText && (
            <div className="resume-text-area">
              <label>解析出的简历文本（可手动修改）</label>
              <textarea value={resumeText} onChange={e => setResumeText(e.target.value)} rows={6} />
            </div>
          )}
        </div>

        {/* 档案摘要 */}
        {completion > 0 && (
          <div className="profile-summary">
            <h3>📊 档案摘要</h3>
            <div className="summary-tags">
              {profile.name && <span className="tag">{profile.gender === '男' ? '👨' : profile.gender === '女' ? '👩' : '👤'} {profile.name}{profile.age ? ` ${profile.age}岁` : ''}</span>}
              {profile.education && <span className="tag">🎓 {profile.education}</span>}
              {profile.school && <span className="tag">🏫 {profile.school}</span>}
              {profile.major && <span className="tag">📚 {profile.major}</span>}
              {profile.majorRanking && <span className="tag">📊 {profile.majorRanking}</span>}
              {profile.jobType && <span className="tag">💼 {profile.jobType}</span>}
              {(profile.cities || []).length > 0 && <span className="tag">📍 {(profile.cities || []).slice(0,3).join('、')}{(profile.cities||[]).length>3?'...':''}</span>}
              {(profile.positions || []).length > 0 && <span className="tag">🎯 {(profile.positions || []).slice(0,3).join('、')}{(profile.positions||[]).length>3?'...':''}</span>}
              {(profile.honors || []).some(h => h.award?.trim()) && <span className="tag">🏆 {(profile.honors || []).filter(h => h.award?.trim()).length}项荣誉</span>}
              {skillsSummary && <span className="tag">🛠️ {skillsSummary.substring(0, 50)}...</span>}
              {resumeFilename && <span className="tag">📎 {resumeFilename}</span>}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============ 渲染：档案状态提示 ============
  const renderProfileHint = () => {
    const completion = calcProfileCompletion(profile, resumeText);
    if (completion >= 30) return null;
    return (
      <div className="profile-hint-banner">
        ⚠️ 个人档案完整度仅 {completion}%，建议先前往 <button className="hint-link" onClick={() => setActiveTab('profile')}>个人档案</button> 填写信息
      </div>
    );
  };

  // ============ 渲染：岗位JD输入 ============
  const renderJDInput = () => (
    <div className="jd-input">
      <h3>💼 岗位 JD</h3>
      <div className="form-field">
        <label>公司名称</label>
        <input type="text" placeholder="如：字节跳动" value={jd.companyName}
          onChange={e => setJd(prev => ({ ...prev, companyName: e.target.value }))} />
      </div>
      <div className="form-field">
        <label>岗位名称</label>
        <input type="text" placeholder="如：前端开发工程师" value={jd.positionName}
          onChange={e => setJd(prev => ({ ...prev, positionName: e.target.value }))} />
      </div>
      <div className="form-field">
        <label>岗位职责</label>
        <textarea placeholder="粘贴岗位职责描述" rows={3} value={jd.responsibilities}
          onChange={e => setJd(prev => ({ ...prev, responsibilities: e.target.value }))} />
      </div>
      <div className="form-field">
        <label>任职要求</label>
        <textarea placeholder="粘贴任职要求" rows={3} value={jd.requirements}
          onChange={e => setJd(prev => ({ ...prev, requirements: e.target.value }))} />
      </div>
    </div>
  );

  // ============ 渲染：AI结果 ============

  // 区块配色轮盘
  const blockColors = [
    { bg: '#eef2ff', border: '#c7d2fe', accent: '#6366f1', title: '#4338ca', icon: '🔹' },
    { bg: '#f0fdf4', border: '#bbf7d0', accent: '#22c55e', title: '#166534', icon: '🟢' },
    { bg: '#faf5ff', border: '#e9d5ff', accent: '#a855f7', title: '#7c3aed', icon: '🟣' },
    { bg: '#fffbeb', border: '#fde68a', accent: '#f59e0b', title: '#b45309', icon: '🟡' },
    { bg: '#fff1f2', border: '#fecdd3', accent: '#f43f5e', title: '#be123c', icon: '🔴' },
    { bg: '#f0f9ff', border: '#bae6fd', accent: '#0ea5e9', title: '#0369a1', icon: '🔵' },
  ];
  let blockColorIdx = 0;
  const getNextColor = () => blockColors[blockColorIdx++ % blockColors.length];

  // 高亮重要内容：数字、百分比、**包裹文本
  const highlightImportant = (text) => {
    let parts = [];
    let lastIdx = 0;
    // 匹配 **text** / 数字+单位 / 百分比 / 【】标记
    const regex = /\*\*(.+?)\*\*|(\d+(?:\.\d+)?%?)|\【(.+?)\】|(关键|重点|建议|注意|优势|劣势|风险|机遇|核心|推荐)/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
      if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
      if (m[1]) parts.push(`<span class="hl-badge">${m[1]}</span>`);           // **text**
      else if (m[2]) parts.push(`<span class="hl-num">${m[2]}</span>`);        // 数字/%
      else if (m[3]) parts.push(`<span class="hl-tag">【${m[3]}】</span>`);    // 【】
      else if (m[4]) parts.push(`<span class="hl-key">${m[4]}</span>`);        // 关键词
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < text.length) parts.push(text.slice(lastIdx));
    // 强制清除所有残留星号和井号（兜底）
    return parts.join('').replace(/[*#]/g, '');
  };

  // 区块渲染器：按标题分块，每块不同底色
  const renderResultBlocks = (text) => {
    if (!text) return null;
    blockColorIdx = 0;
    // 按 ## 或 ### 或 # 分割
    const sections = text.split(/\n(?=#{1,3}\s)/);
    
    return sections.map((section, si) => {
      const lines = section.split('\n');
      const firstLine = lines[0] || '';
      const isHeading = /^#{1,3}\s/.test(firstLine);
      const headingText = isHeading ? firstLine.replace(/^#{1,3}\s/, '') : '';
      const contentLines = isHeading ? lines.slice(1) : lines;
      
      const color = getNextColor();
      
      // 处理内容：表格行聚合
      const contentElements = [];
      let tableRows = [];
      let inTable = false;
      
      contentLines.forEach((line, li) => {
        const isTableRow = line.trim().startsWith('|') && line.trim().endsWith('|');
        const isSeparator = /^\|[\s\-:|]+\|$/.test(line.trim());
        
        if (isTableRow) {
          if (!inTable) { inTable = true; tableRows = []; }
          if (!isSeparator) tableRows.push(line);
        } else {
          // 结束表格
          if (inTable && tableRows.length > 0) {
            contentElements.push(
              <table key={`tb-${si}-${li}`} className="result-table">
                <tbody>
                  {tableRows.map((row, ri) => {
                    const cells = row.split('|').filter((_, ci, arr) => ci > 0 && ci < arr.length - 1);
                    const Tag = ri === 0 ? 'th' : 'td';
                    return <tr key={ri}>{cells.map((cell, ci) => 
                      <Tag key={ci} className={ri===0?'result-th':'result-td'}>{cell.trim().replace(/[*#]/g, '')}</Tag>
                    )}</tr>;
                  })}
                </tbody>
              </table>
            );
            inTable = false; tableRows = [];
          }
          
          if (!line.trim()) {
            contentElements.push(<div key={`br-${si}-${li}`} className="rb-spacer"></div>);
            return;
          }
          
          // 处理列表行：先清除行首的列表标记（- 或 * 或 数字.），再清除残留的#和*
          const matchBullet = line.match(/^[-*]\s/);
          const matchNum = line.match(/^\d+[.、]\s/);
          let cleanLine = line.replace(/^[-*]\s/, '').replace(/^\d+[.、]\s/, '');
          // 预处理：将列表项中残留的**加粗**标签吃掉（在highlightImportant已处理，这里兜底）
          cleanLine = cleanLine.replace(/[*#]/g, '');
          if (matchBullet || matchNum) {
            contentElements.push(
              <div key={`li-${si}-${li}`} className="rb-li">
                <span className="rb-li-dot" style={{ background: color.accent }}></span>
                <span dangerouslySetInnerHTML={{ __html: highlightImportant(cleanLine) + (matchNum ? '' : '') }}></span>
              </div>
            );
          } else {
            // 对非列表行也先清理 # 和 *
            const cleanedLine = line.replace(/[*#]/g, '');
            contentElements.push(
              <p key={`p-${si}-${li}`} className="rb-p" dangerouslySetInnerHTML={{ __html: highlightImportant(cleanedLine) }}></p>
            );
          }
        }
      });
      
      // 收尾表格
      if (inTable && tableRows.length > 0) {
        contentElements.push(
          <table key={`tb-last-${si}`} className="result-table">
            <tbody>
              {tableRows.map((row, ri) => {
                const cells = row.split('|').filter((_, ci, arr) => ci > 0 && ci < arr.length - 1);
                const Tag = ri === 0 ? 'th' : 'td';
                return <tr key={ri}>{cells.map((cell, ci) => 
                  <Tag key={ci} className={ri===0?'result-th':'result-td'}>{cell.trim().replace(/[*#]/g, '')}</Tag>
                )}</tr>;
              })}
            </tbody>
          </table>
        );
      }
      
      return (
        <div key={`bk-${si}`} className="result-block" style={{ background: color.bg, borderColor: color.border }}>
          {isHeading && headingText && (
            <div className="rb-heading" style={{ color: color.title }}>
              <span className="rb-h-icon">{color.icon}</span>
              <span className="rb-h-line" style={{ background: color.border }}></span>
              <span>{headingText}</span>
            </div>
          )}
          <div className="rb-body">{contentElements}</div>
        </div>
      );
    });
  };

  const renderResult = (resultText, isLoading, errMsg) => {
    return (
    <div className="result-area" ref={resultRef}>
      {!resultText && !isLoading && !errMsg && (
        <div className="result-empty-placeholder">
          <div className="empty-icon">📊</div>
          <h4>等待 AI 分析</h4>
          <p>点击左侧按钮，AI 将根据你的档案信息生成分析结果</p>
          <p className="empty-hint">💡 提示：请先在「个人档案」中填写或上传简历信息</p>
        </div>
      )}
      {isLoading && <div className="loading-indicator"><span className="spinner"></span>AI 正在分析中...</div>}
      {errMsg && <div className="error-msg">❌ {errMsg}</div>}
      {resultText && (
        <div className="result-content">
          {matchScore && (
            <div className="match-score-card">
              <div className="match-score-value">{matchScore.score}</div>
              <div className="match-score-unit">分</div>
              <div className="match-score-label">{matchScore.level || '综合评分'}</div>
            </div>
          )}
          <div className="result-header">
            <h3>📊 AI 分析结果</h3>
            <button className="copy-btn" onClick={() => copyResult(resultText)}>📋 复制</button>
          </div>
          <div className="result-text">
            {renderResultBlocks(resultText)}
          </div>
        </div>
      )}
    </div>
  )};

  // ============ 渲染：首页 ============
  const renderHome = () => (
    <div className="home-page">
      {/* 功能卡片网格 */}
      <div className="feature-grid-v3">
        <div className="feature-card-v3 fc-profile" onClick={() => setActiveTab('profile')}>
          <div className="fc3-icon-wrap i-profile">👤</div>
          <div className="fc3-content">
            <h3>个人档案</h3>
            <p>一次填写，全局调用，AI 智能解析简历信息，自动构建求职档案</p>
          </div>
          <div className="fc3-tags">
            <span className="fc3-tag">简历解析</span>
            <span className="fc3-tag">智能建档</span>
          </div>
          <div className="fc3-arrow">→</div>
        </div>

        <div className="feature-card-v3 fc-recommend" onClick={() => setActiveTab('recommend')}>
          <div className="fc3-icon-wrap i-recommend">🎯</div>
          <div className="fc3-content">
            <h3>岗位推荐</h3>
            <p>AI 深度诊断个人优势，精准匹配海量岗位，智能制定投递计划</p>
          </div>
          <div className="fc3-tags">
            <span className="fc3-tag">多平台聚合</span>
            <span className="fc3-tag">精准匹配</span>
          </div>
          <div className="fc3-arrow">→</div>
        </div>

        <div className="feature-card-v3 fc-resume" onClick={() => setActiveTab('resume')}>
          <div className="fc3-icon-wrap i-resume">📝</div>
          <div className="fc3-content">
            <h3>简历优化</h3>
            <p>岗位匹配度深度分析，STAR 法则专业改写，资深 HR 视角建议</p>
          </div>
          <div className="fc3-tags">
            <span className="fc3-tag">STAR法则</span>
            <span className="fc3-tag">HR视角</span>
          </div>
          <div className="fc3-arrow">→</div>
        </div>

        <div className="feature-card-v3 fc-interview" onClick={() => setActiveTab('interview')}>
          <div className="fc3-icon-wrap i-interview">💼</div>
          <div className="fc3-content">
            <h3>模拟面试</h3>
            <p>AI 面试官一对一实战演练，逐轮评分反馈，视频/文字双模式</p>
          </div>
          <div className="fc3-tags">
            <span className="fc3-tag">视频面试</span>
            <span className="fc3-tag">实时评分</span>
          </div>
          <div className="fc3-arrow">→</div>
        </div>

        <div className="feature-card-v3 fc-assistant" onClick={() => setActiveTab('assistant')}>
          <div className="fc3-icon-wrap i-assistant">🤖</div>
          <div className="fc3-content">
            <h3>招聘助手</h3>
            <p>央国企 · 外企 · 互联网大厂多视角智能答疑，随时解答求职困惑</p>
          </div>
          <div className="fc3-tags">
            <span className="fc3-tag">多视角</span>
            <span className="fc3-tag">智能问答</span>
          </div>
          <div className="fc3-arrow">→</div>
        </div>
      </div>

      {/* 底部特色条 */}
      <div className="home-features-row">
        <div className="home-feat-mini">
          <span className="hfm-icon">⚡</span>
          <span className="hfm-text">AI 智能驱动，实时响应需求</span>
        </div>
        <div className="home-feat-mini">
          <span className="hfm-icon">🔒</span>
          <span className="hfm-text">数据本地存储，隐私安全无忧</span>
        </div>
        <div className="home-feat-mini">
          <span className="hfm-icon">🎓</span>
          <span className="hfm-text">专为大学生求职场景打造</span>
        </div>
      </div>
    </div>
  );

  // ============ 渲染：功能页通用布局 ============
  const renderFeaturePage = (title, icon, jdRequired, actionBtn, children, resultText, isLoading, errMsg) => (
    <div className="tab-content">
      <div className="input-panel">
        {renderProfileHint()}
        <h3>{icon} {title}</h3>
        {children}
        {jdRequired && renderJDInput()}
        {actionBtn}
      </div>
      <div className="output-panel">
        {renderResult(resultText, isLoading, errMsg)}
      </div>
    </div>
  );

  const renderRecommend = () => (
    <div className="tab-content">
      <div className="input-panel">
        {renderProfileHint()}
        <h3>🎯 多源聚合 · 岗位匹配</h3>
        <p className="form-hint">
          聚合 <strong>Boss直聘 / 拉勾网 / 猎聘 / 牛客网 / 前程无忧 / 公司官网 / 脉脉</strong> 七大平台公开招聘信息，AI 逐一分析岗位匹配度并附带直达投递链接。
        </p>
        
        <button className="action-btn aggregation-main-btn" onClick={handleAggregation} disabled={recommendLoading}>
          {recommendLoading ? '⏳ 正在聚合多平台招聘信息...' : '📡 开始多源聚合匹配'}
        </button>

        {recommendResult && (
          <button className="action-btn" onClick={handleDeliveryPlan} disabled={recommendLoading} style={{marginTop: 16, background: '#059669'}}>
            {recommendLoading ? '⏳ 制定中...' : '📋 基于推荐结果制定投递计划'}
          </button>
        )}

        {/* 聚合来源指示器 */}
        {recommendResult && (
          <div className="aggregation-sources">
            <span className="aggr-label">📡 数据来源：</span>
            <span className="source-badge boss">🟢 Boss直聘</span>
            <span className="source-badge lagou">🔵 拉勾网</span>
            <span className="source-badge liepin">🟠 猎聘</span>
            <span className="source-badge niuke">🟣 牛客网</span>
            <span className="source-badge official">🏢 公司官网</span>
            <span className="source-badge maimai">🔴 脉脉</span>
          </div>
        )}
      </div>
      <div className="output-panel">
        {renderResult(recommendResult, recommendLoading, recommendError)}
      </div>
    </div>
  );

  const renderResume = () => renderFeaturePage('简历优化', '📄', true,
    <button className="action-btn" onClick={handleOptimizeResume} disabled={resumeLoading}>
      {resumeLoading ? '⏳ 优化中...' : '📄 根据岗位JD修改简历'}
    </button>, null, resumeResult, resumeLoading, resumeError
  );

  // ============ 招聘助手 ============
  const handleAssistantSend = () => {
    if (!assistantInput.trim() || assistantLoading) return;
    const userMsg = { role: 'user', content: assistantInput.trim() };
    const newMessages = [...assistantMessages, userMsg];
    setAssistantMessages(newMessages);
    setAssistantInput('');
    setAssistantLoading(true);

    // 添加空的助手消息占位
    const assistantMsg = { role: 'assistant', content: '' };
    setAssistantMessages([...newMessages, assistantMsg]);

    let accumulated = '';
    chatAssistantStream(
      assistantPerspective,
      newMessages,
      fullProfile,
      resumeText,
      (delta) => {
        accumulated += delta;
        setAssistantMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: accumulated };
          return updated;
        });
      },
      (fullContent) => {
        setAssistantMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: fullContent };
          return updated;
        });
        setAssistantLoading(false);
      },
      (err) => {
        setAssistantMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: '抱歉，出错了：' + err };
          return updated;
        });
        setAssistantLoading(false);
      }
    );
  };

  const handleAssistantKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAssistantSend();
    }
  };

  const clearAssistantChat = () => {
    setAssistantMessages([]);
  };

  // 编辑用户消息
  const handleStartEdit = (idx) => {
    setEditingIndex(idx);
    setEditContent(assistantMessages[idx].content);
  };

  const handleCancelEdit = () => {
    setEditingIndex(-1);
    setEditContent('');
  };

  const handleSaveEdit = (idx) => {
    if (!editContent.trim() || assistantLoading) return;
    // 更新用户消息，并删除后面的所有消息
    const updatedMessages = assistantMessages.slice(0, idx);
    const userMsg = { role: 'user', content: editContent.trim() };
    const newMessages = [...updatedMessages, userMsg];
    setAssistantMessages(newMessages);
    setEditingIndex(-1);
    setEditContent('');
    // 自动重新发送
    setAssistantLoading(true);
    const assistantMsg = { role: 'assistant', content: '' };
    setAssistantMessages([...newMessages, assistantMsg]);

    let accumulated = '';
    chatAssistantStream(
      assistantPerspective,
      newMessages,
      fullProfile,
      resumeText,
      (delta) => {
        accumulated += delta;
        setAssistantMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: accumulated };
          return updated;
        });
      },
      (fullContent) => {
        setAssistantMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: fullContent };
          return updated;
        });
        setAssistantLoading(false);
      },
      (err) => {
        setAssistantMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: '抱歉，出错了：' + err };
          return updated;
        });
        setAssistantLoading(false);
      }
    );
  };

  // 重新生成AI回复
  const handleRegenerate = (idx) => {
    if (assistantLoading) return;
    // 取该assistant消息之前的所有消息（不包含当前assistant消息）
    const prevMessages = assistantMessages.slice(0, idx);
    if (prevMessages.length === 0 || prevMessages[prevMessages.length - 1].role !== 'user') return;
    setAssistantMessages(prevMessages);
    setRegeneratingIndex(idx);
    setAssistantLoading(true);

    const assistantMsg = { role: 'assistant', content: '' };
    setAssistantMessages([...prevMessages, assistantMsg]);

    let accumulated = '';
    chatAssistantStream(
      assistantPerspective,
      prevMessages,
      fullProfile,
      resumeText,
      (delta) => {
        accumulated += delta;
        setAssistantMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: accumulated };
          return updated;
        });
      },
      (fullContent) => {
        setAssistantMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: fullContent };
          return updated;
        });
        setAssistantLoading(false);
        setRegeneratingIndex(-1);
      },
      (err) => {
        setAssistantMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: '抱歉，出错了：' + err };
          return updated;
        });
        setAssistantLoading(false);
        setRegeneratingIndex(-1);
      }
    );
  };

  const PERSPECTIVES = [
    { key: '', label: '综合', icon: '🌐', desc: '综合多视角回答' },
    { key: '央国企', label: '央国企', icon: '🏛️', desc: '国网/中石油/移动等' },
    { key: '外企', label: '外企', icon: '🌍', desc: '宝洁/麦肯锡/联合利华' },
    { key: '民企', label: '民企', icon: '🏢', desc: '华为/美的/格力等' },
    { key: '互联网大厂', label: '互联网大厂', icon: '💻', desc: '字节/腾讯/阿里等' },
  ];

  const renderAssistant = () => (
    <div className="assistant-page">
      <div className="assistant-header">
        <h2>🤖 招聘助手</h2>
        <p className="assistant-subtitle">把HR的问题发给我，我帮你给出完美回答</p>
        <div className="perspective-selector">
          <span className="perspective-label">企业视角：</span>
          {PERSPECTIVES.map(p => (
            <button key={p.key}
              className={`perspective-btn ${assistantPerspective === p.key ? 'active' : ''}`}
              onClick={() => setAssistantPerspective(p.key)}
              title={p.desc}>
              {p.icon} {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="assistant-chat">
        <div className="chat-messages">
          {assistantMessages.length === 0 && (
            <div className="chat-empty">
              <div className="chat-empty-icon">🤖</div>
              <h3>你好，我是招聘助手</h3>
              <p>你可以把HR的问题发给我，我会根据你选择的企业视角给出专业的回答建议</p>
              <div className="quick-questions">
                <button className="quick-q-btn" onClick={() => setAssistantInput('请做一下自我介绍')}>请做一下自我介绍</button>
                <button className="quick-q-btn" onClick={() => setAssistantInput('你为什么选择我们公司？')}>你为什么选择我们公司？</button>
                <button className="quick-q-btn" onClick={() => setAssistantInput('你最大的优缺点是什么？')}>你最大的优缺点是什么？</button>
                <button className="quick-q-btn" onClick={() => setAssistantInput('你的职业规划是什么？')}>你的职业规划是什么？</button>
                <button className="quick-q-btn" onClick={() => setAssistantInput('请分享一个你解决过的最有挑战的问题')}>最有挑战的问题</button>
                <button className="quick-q-btn" onClick={() => setAssistantInput('你如何看待加班？')}>你如何看待加班？</button>
              </div>
            </div>
          )}
          {assistantMessages.map((msg, idx) => (
            <div key={idx} className={`chat-message ${msg.role}`}>
              <div className="chat-avatar">{msg.role === 'user' ? '👤' : '🤖'}</div>
              <div className="chat-bubble">
                {editingIndex === idx ? (
                  <div className="chat-edit-area">
                    <textarea
                      className="chat-edit-input"
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      rows={2}
                      autoFocus
                    />
                    <div className="chat-edit-actions">
                      <button className="chat-edit-save-btn" onClick={() => handleSaveEdit(idx)} disabled={!editContent.trim() || assistantLoading}>保存</button>
                      <button className="chat-edit-cancel-btn" onClick={handleCancelEdit}>取消</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="chat-content" dangerouslySetInnerHTML={{
                      __html: formatAssistantContent(msg.content || (msg.role === 'assistant' && assistantLoading && idx === assistantMessages.length - 1 ? '...' : ''))
                    }} />
                    {msg.role === 'user' && !assistantLoading && (
                      <button className="chat-action-btn edit-btn" onClick={() => handleStartEdit(idx)} title="编辑问题">✏️</button>
                    )}
                  </>
                )}
              </div>
              {msg.role === 'assistant' && msg.content && !assistantLoading && (
                <button className="chat-action-btn regenerate-btn" onClick={() => handleRegenerate(idx)} title="重新生成">🔄</button>
              )}
            </div>
          ))}
          {assistantLoading && assistantMessages[assistantMessages.length - 1]?.role === 'user' && (
            <div className="chat-message assistant">
              <div className="chat-avatar">🤖</div>
              <div className="chat-bubble">
                <div className="typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="chat-input-bar">
          <textarea
            className="chat-input"
            value={assistantInput}
            onChange={e => setAssistantInput(e.target.value)}
            onKeyDown={handleAssistantKeyDown}
            placeholder="输入HR的问题或你的求职疑问..."
            rows={1}
            disabled={assistantLoading}
          />
          <button className="chat-send-btn" onClick={handleAssistantSend} disabled={assistantLoading || !assistantInput.trim()}>
            {assistantLoading ? '...' : '发送'}
          </button>
          {assistantMessages.length > 0 && (
            <button className="chat-clear-btn" onClick={clearAssistantChat} title="清空对话">🗑️</button>
          )}
        </div>
      </div>
    </div>
  );

  function formatAssistantContent(text) {
    if (!text) return '';
    // 第一步：HTML 转义
    let html = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // 第二步：一次性完成所有标记转换（避免串行替换导致的嵌套问题）
    html = html.replace(/\*\*(.+?)\*\*/g, (_, inner) => 
      `<span class="hl-badge">${inner.replace(/(\d+(?:\.\d+)?%?)/g, '<span class="hl-num">$1</span>')}</span>`
    );
    // 第三步：处理未包裹在**内的数字（避免再次匹配已处理的）
    html = html.replace(/(?<!hl-badge">)(?<!hl-num">)(?<!">)(\d+(?:\.\d+)?%?)(?!<\/span>)/g, '<span class="hl-num">$1</span>');
    // 第四步：关键词
    html = html.replace(/(关键|重点|建议|注意|优势|劣势|核心|推荐|必备|优先)/g, '<span class="hl-key">$1</span>');
    // 第五步：标题
    html = html.replace(/### (.+)/g, '<h4 class="chat-h4">$1</h4>');
    html = html.replace(/## (.+)/g, '<h3 class="chat-h3">$1</h3>');
    
    // 第六步：强制清除所有残留星号和井号（兜底）
    html = html.replace(/[*#]/g, '');

    // 第七步：按 ## 分割为区块，每块不同底色
    const sections = html.split(/(<h3 class="chat-h3">.+?<\/h3>)/);
    const chatColors = ['#eef2ff', '#f0fdf4', '#faf5ff', '#fffbeb', '#fff1f2', '#f0f9ff'];
    const chatBorders = ['#c7d2fe', '#bbf7d0', '#e9d5ff', '#fde68a', '#fecdd3', '#bae6fd'];
    let ci = 0;
    let result = '';
    let isInSection = false;
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (!s.trim()) continue;
      if (/^<h3/.test(s)) {
        if (isInSection) result += '</div>';
        const c = chatColors[ci % chatColors.length];
        const b = chatBorders[ci % chatBorders.length];
        result += `<div class="chat-block" style="background:${c};border-left:3px solid ${b};border-radius:8px;padding:8px 12px;margin:8px 0">`;
        result += s;
        isInSection = true;
        ci++;
      } else {
        if (!isInSection) { result += '<div class="chat-block">'; isInSection = true; }
        result += s.replace(/\n/g, '<br/>');
      }
    }
    if (isInSection) result += '</div>';
    return result || html.replace(/\n/g, '<br/>');
  }

  // ============ 渲染：模拟面试 ============
const renderInterview = () => {
    // ① 选择页：视频面试 / 无视频面试
    if (ivStep === 'select') return (
      <div className="iv-select-page">
        <h2>🎯 选择面试模式</h2>
        <p className="iv-select-desc">请选择面试方式，视频面试将开启摄像头进行完整模拟</p>
        <div className="iv-select-cards">
          <div className="iv-card iv-card-video" onClick={() => handleSelectMode('video')}>
            <div className="iv-card-icon">🎥</div>
            <h3>视频面试</h3>
            <p>开启摄像头模拟真实面试场景，AI根据回答内容专业度评分</p>
            <ul>
              <li>📷 需开启摄像头（模拟面试场景）</li>
              <li>🎤 语音实时转文字字幕</li>
              <li>📊 内容质量100分制严格评分</li>
              <li>🎯 每题≥80分通过，8题全部通过面试合格</li>
            </ul>
          </div>
          <div className="iv-card iv-card-text" onClick={() => handleSelectMode('text')}>
            <div className="iv-card-icon">⌨️</div>
            <h3>无视频面试</h3>
            <p>纯文本答题模式，AI根据回答内容专业度评分</p>
            <ul>
              <li>📝 手动输入文字回答</li>
              <li>📊 内容维度100分制严格评分</li>
              <li>🎯 每题≥80分通过，8题全部通过面试合格</li>
              <li>⚡ 无需摄像头和麦克风</li>
            </ul>
          </div>
        </div>
      </div>
    );

    // ② 准备页：输入JD
    if (ivStep === 'prepare') return (
      <div className="iv-ready-page">
        <h2>{ivMode === 'video' ? '🎥 视频面试' : '⌨️ 文字面试'} — 准备阶段</h2>
        <p className="form-hint" style={{textAlign:'center',marginBottom:24}}>
          {ivMode === 'video'
            ? '请粘贴目标岗位JD，然后开启摄像头，AI将根据JD生成8道定制面试题'
            : '请粘贴目标岗位JD，AI将根据JD生成8道定制面试题'}
        </p>
        <div className="iv-jd-area">
          <label className="iv-jd-label">📝 请输入岗位 JD（职位描述）</label>
          <textarea className="iv-jd-input" value={ivJd} onChange={e => setIvJd(e.target.value)}
            rows={6} placeholder="在此粘贴目标岗位的完整职位描述、职责要求、任职资格等内容..." />
        </div>
        {ivMode === 'video' && !videoEnabled && (
          <div className="iv-cam-setup">
            <p className="iv-hint-warn">⚠️ 视频面试需要开启摄像头和麦克风，请点击下方按钮授权</p>
            <button className="iv-cam-btn" onClick={startCameraSep}>
              📷 开启摄像头
            </button>
            {camError && <p className="iv-cam-error">{camError}</p>}
            <p className="iv-cam-debug">💡 手机端提示：请使用 Chrome/Edge 浏览器，并通过 HTTPS 地址访问（摄像头API要求安全连接）</p>
          </div>
        )}
        {ivMode === 'video' && videoEnabled && (
          <div className="iv-video-preview">
            <video ref={videoRef} autoPlay playsInline muted className="iv-video-feed" />
            <span className="iv-cam-ok">✅ 摄像头已就绪</span>
          </div>
        )}
        <button className="iv-ready-btn" onClick={handlePrepare} disabled={!ivJd.trim() || (ivMode==='video' && !videoEnabled)}>
          🚀 准备完成，AI 出题
        </button>
      </div>
    );

    // 加载中
    if (ivStep === 'loading') return (
      <div className="iv-loading-page">
        <div className="spinner"></div>
        <p>AI 正在根据岗位JD生成8道定制面试题...</p>
        <p className="iv-loading-hint">结合JD职责和要求，生成针对性问题</p>
      </div>
    );

    // ③ 准备答题：显示问题
    if (ivStep === 'ready') return (
      <div className="iv-ready-page">
        <div className="iv-ready-header">
          <div className="iv-progress-bar">
            <div className="iv-progress-fill" style={{width:(ivQIndex/8*100)+'%'}}></div>
          </div>
          <div className="iv-progress-info">
            <span className="iv-progress-text">第 {ivQIndex+1}/8 题</span>
            <span className="iv-progress-passed">✅ 已通过 {ivScores.filter(s=>s.passed).length} 题</span>
          </div>
        </div>
        <div className="iv-q-card">
          <div className="iv-q-num">Q{ivQIndex+1}</div>
          <p className="iv-q-text">{ivCurrentQ}</p>
        </div>
        {ivMode === 'video' && videoEnabled && (
          <div className="iv-video-preview"><video ref={videoRef} autoPlay playsInline muted className="iv-video-feed" /></div>
        )}
        <p className="iv-ready-hint">
          {ivMode === 'video' ? '🎤 点击下方按钮后自动开始录音，请面对摄像头用口语回答问题' : '⌨️ 点击下方按钮后在文本框中输入你的回答'}
        </p>
        <button className="iv-ready-btn" onClick={handleReady}>
          {ivMode === 'video' ? '✅ 准备完成，开始作答（自动录音）' : '✅ 准备完成，开始作答'}
        </button>
      </div>
    );

    // ④ 答题中
    if (ivStep === 'answering') return (
      <div className="iv-answer-page">
        <div className="iv-answer-header">
          <div className="iv-progress-bar"><div className="iv-progress-fill" style={{width:(ivQIndex/8*100)+'%'}}></div></div>
          <div className="iv-progress-info">
            <span className="iv-progress-text">第 {ivQIndex+1}/8 题</span>
            <span className="iv-progress-passed">✅ 已通过 {ivScores.filter(s=>s.passed).length} 题</span>
          </div>
        </div>
        <div className="iv-answer-layout">
          <div className="iv-answer-left">
            {ivMode === 'video' && videoEnabled && (
              <div className="iv-video-big">
                <video ref={videoRef} autoPlay playsInline muted className="iv-video-feed" />
                {isRecording && <div className="iv-rec-dot"></div>}
              </div>
            )}
            <div className="iv-q-mini">
              <span className="iv-q-badge">Q{ivQIndex+1}</span>
              <p>{ivCurrentQ}</p>
            </div>
          </div>
          <div className="iv-answer-right">
            {ivMode === 'video' ? (
              <>
                {/* 情况1：Web Speech API 实时语音识别 */}
                {speechSupported && (
                  <>
                    <div className="iv-speech-area">
                      <div className="iv-speech-header">
                        <span>🎤 实时字幕（语音转文字）</span>
                        <div className="iv-speech-btns">
                          {isRecording && <span className="iv-rec-label">🔴 录音中</span>}
                          {!isRecording && <button className="iv-mic-btn" onClick={startSpeechRecognition}>🎤 重新录音</button>}
                        </div>
                      </div>
                      <div className="iv-subtitle-box">
                        {speechError && <p className="iv-speech-error-inline">⚠️ {speechError}</p>}
                        {ivAnswer ? <p className="iv-subtitle-text">{ivAnswer}</p> : <p className="iv-subtitle-empty">请面对摄像头，用口语清晰回答问题...</p>}
                      </div>
                    </div>
                    {speechError && (
                      <textarea className="iv-text-fallback" value={ivAnswer} onChange={e => setIvAnswer(e.target.value)}
                        rows={3} placeholder="语音不可用，请在此手动输入回答..." />
                    )}
                  </>
                )}

                {/* 情况2：MediaRecorder 通用录音转文字（iOS/Safari/Firefox 等） */}
                {!speechSupported && mediaRecordingSupported && (
                  <>
                    <div className="iv-speech-area">
                      <div className="iv-speech-header">
                        <span>🎙️ 通用录音转文字</span>
                        <div className="iv-speech-btns">
                          {isMediaRecording && <span className="iv-rec-label">🔴 录音中…</span>}
                          {isTranscribing && <span className="iv-rec-label">🔄 转写中…</span>}
                          {!isMediaRecording && !isTranscribing && (
                            <button className="iv-mic-btn" onClick={startMediaRecording}>🎙️ 开始录音</button>
                          )}
                          {isMediaRecording && (
                            <button className="iv-mic-btn iv-stop-mic" onClick={stopMediaRecording}>⏹️ 停止并转文字</button>
                          )}
                        </div>
                      </div>
                      <div className="iv-subtitle-box">
                        {speechError && !ivAnswer && <p className="iv-speech-error-inline">💡 {speechError}</p>}
                        {ivAnswer ? <p className="iv-subtitle-text">{ivAnswer}</p> : <p className="iv-subtitle-empty">
                          {isMediaRecording ? '🔴 正在录音，请对着麦克风说话…' : isTranscribing ? '🔄 AI 正在将录音转为文字…' : '点击"开始录音"录制你的回答，说完后点击"停止并转文字"'}
                        </p>}
                      </div>
                    </div>
                    <textarea className="iv-text-fallback" value={ivAnswer} onChange={e => setIvAnswer(e.target.value)}
                      rows={3} placeholder="转写后可在此手动编辑回答..." />
                  </>
                )}

                {/* 情况3：完全不支持语音 → 手动输入 */}
                {!speechSupported && !mediaRecordingSupported && (
                  <>
                    <div className="iv-speech-area">
                      <div className="iv-speech-header"><span>📝 文字输入（设备不支持语音）</span></div>
                      <textarea className="iv-answer-textarea" value={ivAnswer} onChange={e => setIvAnswer(e.target.value)}
                        rows={6} placeholder="在此手动输入你对问题的回答..." />
                    </div>
                  </>
                )}

                <button className="iv-end-btn" onClick={handleEndAnswer}>⏹️ 回答结束，提交评分</button>
              </>
            ) : (
              <>
                {/* 文字模式：优先提供录音转文字（MediaRecorder），也可手动输入 */}
                {mediaRecordingSupported && (
                  <div className="iv-speech-area">
                    <div className="iv-speech-header">
                      <span>🎙️ 语音输入（可选）</span>
                      <div className="iv-speech-btns">
                        {isMediaRecording && <span className="iv-rec-label">🔴 录音中…</span>}
                        {isTranscribing && <span className="iv-rec-label">🔄 转写中…</span>}
                        {!isMediaRecording && !isTranscribing && (
                          <button className="iv-mic-btn" onClick={startMediaRecording}>🎙️ 录音转文字</button>
                        )}
                        {isMediaRecording && (
                          <button className="iv-mic-btn iv-stop-mic" onClick={stopMediaRecording}>⏹️ 停止并转写</button>
                        )}
                      </div>
                    </div>
                    {ivAnswer && <div className="iv-subtitle-box" style={{marginTop:8}}><p className="iv-subtitle-text">{ivAnswer}</p></div>}
                  </div>
                )}
                <div className="iv-speech-area">
                  <div className="iv-speech-header"><span>📝 请输入你的回答</span></div>
                  <textarea className="iv-answer-textarea" value={ivAnswer} onChange={e => setIvAnswer(e.target.value)}
                    rows={6} placeholder="在此输入你对问题的回答...（也可使用上方录音转文字）" />
                </div>
                <button className="iv-end-btn" onClick={handleEndAnswer} disabled={!ivAnswer.trim()}>⏹️ 回答结束，提交评分</button>
              </>
            )}
          </div>
        </div>
      </div>
    );

    // ⑤ 评分反馈
    if (ivStep === 'scoring' && ivFeedback) return (
      <div className="iv-score-page">
        <div className="iv-progress-bar"><div className="iv-progress-fill" style={{width:((ivQIndex+(ivFeedback.passed?1:0))/8*100)+'%'}}></div></div>
        <span className="iv-progress-text">第 {ivQIndex+1}/8 题</span>
        <div className="iv-score-card">
          <div className={`iv-score-circle ${ivFeedback.passed ? 'passed' : 'failed'}`}>
            <span className="iv-score-num">{ivFeedback.score || 0}</span>
            <span className="iv-score-label">分</span>
          </div>
          <div className="iv-score-info">
            <h3>{ivFeedback.passed ? '🎉 通过！' : '📝 未通过（需≥80分），请根据反馈重试'}</h3>
            <div className="iv-score-breakdown">
              <div className="score-bar-row"><span>内容分</span><div className="score-bar"><div className="score-bar-fill content" style={{width:(ivFeedback.contentScore||0)+'%'}}></div></div><span>{ivFeedback.contentScore || 0}/100</span></div>
            </div>
            <div className="iv-score-detail">
              {ivFeedback.feedback?.split('\n').map((l,i) => {
                if (!l.trim()) return <div key={i} style={{height:8}}></div>;
                // **text** → 彩色标签，数字 → 高亮，关键词 → 标签，最后清除所有残留 *
                let clean = l.replace(/\*\*(.+?)\*\*/g, '<span class="hl-badge">$1</span>');
                clean = clean.replace(/(\d+(?:\.\d+)?%?)/g, '<span class="hl-num">$1</span>');
                clean = clean.replace(/(关键|重点|建议|注意|优势|不足|亮点|改进|核心|推荐)/g, '<span class="hl-key">$1</span>');
                clean = clean.replace(/[*#]/g, '');
                return <p key={i} className="iv-fb-line" dangerouslySetInnerHTML={{__html: clean}}></p>;
              })}
            </div>
            {ivFeedback.optimizedAnswer && (
              <details className="iv-optimized">
                <summary>💡 查看优化版回答示例</summary>
                <p>{ivFeedback.optimizedAnswer.replace(/[*#]/g, '')}</p>
              </details>
            )}
          </div>
        </div>
        <div className="iv-score-actions">
          {ivFeedback.passed ? (
            <button className="iv-next-btn" onClick={handleNextQ}>▶️ 进入下一题</button>
          ) : (
            <button className="iv-retry-btn" onClick={handleRetry}>🔄 根据反馈重新作答</button>
          )}
        </div>
      </div>
    );

    // ⑥ 总结页
    if (ivStep === 'summary') return (
      <div className="iv-summary-page">
        <h2>🎉 面试完成！</h2>
        <p className="iv-summary-subtitle">全部8题已通过，恭喜你完成本次模拟面试</p>
        <div className="iv-summary-stats">
          <div className="iv-stat"><span className="iv-stat-num">{ivScores.filter(s=>s.passed).length}/8</span><span>通过题数</span></div>
          <div className="iv-stat"><span className="iv-stat-num">{Math.round(ivScores.reduce((a,b)=>a+(b.score||0),0)/Math.max(ivScores.length,1))}</span><span>平均分</span></div>
          <div className="iv-stat"><span className="iv-stat-num">{ivMode === 'video' ? '视频' : '文字'}</span><span>面试模式</span></div>
        </div>
        <div className="iv-summary-table">
          {ivScores.map((s,i) => (
            <div key={i} className={`iv-summary-row ${s.passed ? 'passed' : 'failed'}`}>
              <span className="iv-sr-num">{s.passed ? '✓' : '✗'} Q{i+1}</span>
              <span className="iv-sr-score">{s.score}分</span>
              <span className="iv-sr-feedback">{s.feedback?.split('\n')[0]?.slice(0,60) || ''}</span>
            </div>
          ))}
        </div>
        <button className="iv-restart-btn" onClick={() => { stopCamera(); setIvStep('select'); setIvMode(''); setIvQuestions([]); setIvQIndex(0); setIvScores([]); setIvSummary(''); }}>
          🔄 重新开始面试
        </button>
      </div>
    );

    return null;
  };


  const renderTab = () => {
    switch (activeTab) {
      case 'home': return renderHome();
      case 'profile': return renderProfile();
      case 'recommend': return renderRecommend();
      case 'resume': return renderResume();
      case 'interview': return renderInterview();
      case 'assistant': return renderAssistant();
      default: return renderHome();
    }
  };

  const saveSettings = () => {
    if (apiKeyInput.trim()) {
      localStorage.setItem('ai_api_key', apiKeyInput.trim());
    } else {
      localStorage.removeItem('ai_api_key');
    }
    localStorage.setItem('ai_base_url', apiBaseUrl.trim() || 'https://api.deepseek.com/v1');
    localStorage.setItem('ai_model', apiModel.trim() || 'deepseek-chat');
    setShowSettings(false);
  };

  const handleEnterApp = () => {
    setCoverExiting(true);
    setTimeout(() => setShowCover(false), 700);
  };

  return (
    <ErrorBoundary>
      {showCover && (
        <div className={`cover-overlay ${coverExiting ? 'cover-exit' : ''}`} onClick={handleEnterApp}>
          {/* 动态光斑 */}
          <div className="cover-blob cover-blob-1"></div>
          <div className="cover-blob cover-blob-2"></div>
          <div className="cover-blob cover-blob-3"></div>
          <div className="cover-blob cover-blob-4"></div>

          {/* 粒子 */}
          <div className="cover-particles">
            {[...Array(20)].map((_, i) => (
              <div key={`dot-${i}`} className="cover-particle dot" style={{
                left: `${5 + Math.random()*90}%`,
                animationDuration: `${5 + Math.random()*8}s`,
                animationDelay: `${Math.random()*6}s`
              }}/>
            ))}
            {[...Array(8)].map((_, i) => (
              <div key={`star-${i}`} className="cover-particle star" style={{
                left: `${8 + Math.random()*84}%`,
                animationDuration: `${6 + Math.random()*8}s`,
                animationDelay: `${Math.random()*7}s`
              }}/>
            ))}
          </div>

          {/* 文字内容 */}
          <div className="cover-content">
            <div className="cover-badge">
              <span className="cover-badge-dot"></span>
              大学生 AI 求职助手
            </div>
            <h1 className="cover-title">
              Offer<span className="hl">哪里逃</span>
            </h1>
            <p className="cover-subtitle">你的每一次努力，都值得被心仪 Offer 看见</p>
            <button className="cover-enter-btn" onClick={(e) => { e.stopPropagation(); handleEnterApp(); }}>
              <span>开始探索</span>
              <span className="btn-arrow">→</span>
            </button>
          </div>

          {/* 底部提示 */}
          <div className="cover-hint">点击任意位置进入</div>
        </div>
      )}
      <div className="app">
      <nav className="navbar">
        <div className="nav-brand" onClick={() => setActiveTab('home')}>
          🎯 Offer哪里逃
        </div>
        <div className="nav-tabs">
          {TABS.map(tab => (
            <button key={tab.key}
              className={`nav-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}>
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <main className="main-content">{renderTab()}</main>
      <footer className="footer">
        <p>Offer哪里逃 · AI 驱动 · 使用国内大模型 · 你的简历信息仅用于本次分析</p>
      </footer>
    </div>
    </ErrorBoundary>
  );
}

// ============ 本地简历文本解析（不依赖AI） ============
function localParseResume(text) {
  if (!text || !text.trim()) return null;
  const parsed = {};

  // 学历
  const eduMap = { '博士': '博士', '硕士': '硕士', '研究生': '硕士', '本科': '本科', '学士': '本科', '大专': '大专', '专科': '大专', '高中': '高中及以下', '中专': '高中及以下' };
  for (const [kw, val] of Object.entries(eduMap)) {
    if (text.includes(kw)) { parsed.education = val; break; }
  }

  // 学校 — 匹配"XX大学""XX学院""XX学校"
  const schoolMatch = text.match(/([\u4e00-\u9fa5]{2,15}(?:大学|学院|学校|研究院))/);
  if (schoolMatch) parsed.school = schoolMatch[1];

  // 专业 — 匹配"专业：XXX"或"XXX专业"
  const majorMatch = text.match(/(?:专业|方向)[：:]\s*([^\n,，、\s]{2,20})/) || text.match(/([\u4e00-\u9fa5]{2,15}(?:工程|科学|技术|管理|经济|金融|教育|文学|艺术|医学|法学|数学|物理|化学|生物|计算机|信息|电子|机械|自动化|设计|会计|营销|人力))专业/);
  if (majorMatch) parsed.major = majorMatch[1].replace(/专业$/, '').trim();

  // 年级/毕业时间
  const gradeMatch = text.match(/(20\d{2})\s*[届年毕业]/);
  if (gradeMatch) parsed.grade = gradeMatch[1] + '届';

  // 城市
  const cityMatch = text.match(/(?:城市|地点|所在)[：:]\s*([\u4e00-\u9fa5]{2,6})/) || text.match(/((?:北京|上海|广州|深圳|杭州|成都|南京|武汉|西安|重庆|苏州|天津|长沙|厦门|青岛|大连|珠海|东莞|合肥|郑州|济南|福州|昆明|贵阳|沈阳|哈尔滨|长春|石家庄|兰州|太原|南昌|南宁|乌鲁木齐))/);
  if (cityMatch) parsed.city = cityMatch[1];

  // 技能提取（需在荣誉奖项之前声明，因为证书提取依赖 skills 变量）
  const skills = { language: [], computer: [], newmedia: [], design: [], finance: [], other: [] };

  // 证书（提取到技能中）
  const compGradeMatch = text.match(/计算机[二三四]级/g);
  if (compGradeMatch) {
    for (const g of [...new Set(compGradeMatch)]) {
      if (!skills.computer.some(s => s.name === g)) {
        skills.computer.push({ name: g, level: '' });
      }
    }
  }

  // 荣誉奖项
  const honorPatterns = [/国家奖学金/g, /校[一二三]等奖学金/g, /优秀毕业生/g, /优秀学生干部/g, /三好学生/g, /数学建模[国省]赛/g, /挑战杯/g, /互联网\+?/g, /蓝桥杯/g, /ACM/g];
  const honorItems = [];
  for (const p of honorPatterns) { const m = text.match(p); if (m) honorItems.push({ time: '', award: m[0] }); }
  // 尝试提取带时间的奖项
  const timedHonorRegex = /((?:20\d{2})[./-]?(?:\d{1,2})?)\s*[:：]?\s*([^\n,，]{4,30}?(?:奖|学金|称号|荣誉|优秀|金牌|银牌|铜牌|一等奖|二等奖|三等奖|冠军|亚军|季军))/g;
  let thm;
  while ((thm = timedHonorRegex.exec(text)) !== null) {
    if (!honorItems.some(h => h.award === thm[2].trim())) {
      honorItems.push({ time: thm[1]?.trim() || '', award: thm[2].trim() });
    }
  }
  if (honorItems.length > 0) parsed.honors = [...new Map(honorItems.map(h => [h.award, h])).values()];

  // 语言技能
  const langPatterns = [
    { pattern: /CET-?4[：:\s]*(\d{3})/gi, name: '英语 CET-4' },
    { pattern: /CET-?6[：:\s]*(\d{3})/gi, name: '英语 CET-6' },
    { pattern: /(?:英语|大学英语)[四4]级[：:\s]*(\d{3})/gi, name: '英语 CET-4' },
    { pattern: /(?:英语|大学英语)[六6]级[：:\s]*(\d{3})/gi, name: '英语 CET-6' },
    { pattern: /雅思[：:\s]*(\d[0-9.]*)/gi, name: '雅思 IELTS' },
    { pattern: /IELTS[：:\s]*(\d[0-9.]*)/gi, name: '雅思 IELTS' },
    { pattern: /托福[：:\s]*(\d{2,3})/gi, name: '托福 TOEFL' },
    { pattern: /TOEFL[：:\s]*(\d{2,3})/gi, name: '托福 TOEFL' },
    { pattern: /日语\s*N1/gi, name: '日语 N1' },
    { pattern: /日语\s*N2/gi, name: '日语 N2' },
    { pattern: /韩语\s*TOPIK\s*([56])/gi, name: '韩语 TOPIK' },
  ];
  for (const lp of langPatterns) {
    const m = text.match(lp.pattern);
    if (m) {
      const level = m[1] ? m[1] : '';
      if (!skills.language.some(s => s.name === lp.name)) {
        skills.language.push({ name: lp.name, level });
      }
    }
  }
  // 如果没有具体分数但有英语等级
  if (skills.language.length === 0) {
    if (/英语[四6]级|CET-?6/i.test(text)) skills.language.push({ name: '英语 CET-6', level: '' });
    else if (/英语[四4]级|CET-?4/i.test(text)) skills.language.push({ name: '英语 CET-4', level: '' });
  }

  // 计算机技能
  const compKeywords = ['Python', 'Java', 'JavaScript', 'JS', 'C\\+\\+', 'C#', 'Go', 'Rust', 'TypeScript', 'TS',
    'React', 'Vue', 'Angular', 'Node\\.js', 'Express', 'Django', 'Flask', 'Spring',
    'SQL', 'MySQL', 'MongoDB', 'Redis', 'PostgreSQL',
    'Docker', 'Kubernetes', 'K8s', 'Git', 'Linux', 'Shell',
    'TensorFlow', 'PyTorch', '机器学习', '深度学习', '数据分析', '数据挖掘',
    'HTML', 'CSS', 'Webpack', 'Vite',
    'Hadoop', 'Spark', 'Flink', 'Hive'];
  for (const kw of compKeywords) {
    const re = new RegExp(kw, 'gi');
    if (re.test(text)) {
      const name = kw.replace(/\\/g, '');
      if (!skills.computer.some(s => s.name === name)) {
        skills.computer.push({ name, level: '' });
      }
    }
  }

  // 新媒体技能
  const mediaKeywords = ['公众号', '短视频', '抖音', '小红书', 'B站', '哔哩哔哩', 'PS', 'PR', 'Photoshop', 'Premiere', '文案', '运营', '剪辑'];
  for (const kw of mediaKeywords) {
    if (text.includes(kw) && !skills.newmedia.some(s => s.name.includes(kw))) {
      skills.newmedia.push({ name: kw, level: '' });
    }
  }

  // 设计技能
  const designKeywords = ['Figma', 'Sketch', 'Illustrator', 'UI设计', '交互设计', '视觉设计', '平面设计'];
  for (const kw of designKeywords) {
    if (text.includes(kw) && !skills.design.some(s => s.name === kw)) {
      skills.design.push({ name: kw, level: '' });
    }
  }

  // 金融技能
  const finKeywords = ['Wind', 'Bloomberg', '财务分析', '审计', '税务', '投资分析', '估值建模'];
  for (const kw of finKeywords) {
    if (text.includes(kw) && !skills.finance.some(s => s.name === kw)) {
      skills.finance.push({ name: kw, level: '' });
    }
  }

  // 经历提取
  parsed.experiences = { campus: [], work: [], project: [] };

  // 按时间行提取经历（常见格式：202X.XX - 202X.XX  组织名  内容）
  const expRegex = /((?:20\d{2})[./-](?:\d{1,2})?[./-]?\s*[-–~至到]\s*(?:20\d{2})[./-](?:\d{1,2})?|(?:20\d{2})[./-](?:\d{1,2})?\s*[-–~至到]\s*至今?)\s+([^\n]{2,30})\s*\n?([\s\S]*?)(?=(?:20\d{2})[./-]|$)/g;
  let expMatch;
  while ((expMatch = expRegex.exec(text)) !== null) {
    const time = expMatch[1]?.trim() || '';
    const org = expMatch[2]?.trim() || '';
    const content = expMatch[3]?.trim().replace(/\n+/g, ' ').substring(0, 200) || '';

    // 分类：根据关键词判断类型
    const isWork = /实习|工作|兼职|助理|工程师|分析师|经理|专员|主管|总监|设计师|开发|运营|策划/.test(org + content);
    const isProject = /项目|科研|课题|论文|实验|研究|竞赛|比赛|开发|实现|设计/.test(org + content);

    const timeParts = time.split(/\s*[-–~至到]\s*/);
    const entry = {
      startTime: timeParts[0]?.trim() || '',
      endTime: timeParts[1]?.trim() || '',
      organization: org,
      content: content.substring(0, 150),
    };

    if (isProject) parsed.experiences.project.push(entry);
    else if (isWork) parsed.experiences.work.push(entry);
    else parsed.experiences.campus.push(entry);
  }

  parsed.skills = skills;
  return parsed;
}

// ============ 合并AI解析结果到档案 ============
function mergeParsedProfile(prev, parsed) {
  const newProfile = { ...prev };

  // 基本信息字段
  const basicKeys = ['name', 'age', 'gender', 'education', 'school', 'major', 'majorRanking', 'applyEducation', 'jobType'];
  for (const key of basicKeys) {
    if (parsed[key] && parsed[key].trim && parsed[key].trim() && (!prev[key] || !prev[key].trim())) {
      newProfile[key] = parsed[key];
    }
  }

  // 荣誉奖项
  if (parsed.honors) {
    if (Array.isArray(parsed.honors) && parsed.honors.length > 0) {
      const prevHonors = prev.honors || [{ time: '', award: '' }];
      const hasPrevData = prevHonors.some(h => h.award?.trim());
      const parsedHonorItems = parsed.honors.map(h => {
        if (typeof h === 'object' && (h.time || h.award)) return { time: h.time || '', award: h.award || '' };
        if (typeof h === 'string' && h.trim()) {
          // 尝试解析 "2024.10 国家奖学金" 格式
          const parts = h.trim().match(/^(\d{4}[./-]\d{1,2})\s+(.+)$/);
          if (parts) return { time: parts[1], award: parts[2] };
          return { time: '', award: h.trim() };
        }
        return null;
      }).filter(Boolean);
      if (parsedHonorItems.length > 0) {
        newProfile.honors = hasPrevData ? [...prevHonors, ...parsedHonorItems] : parsedHonorItems;
      }
    } else if (typeof parsed.honors === 'string' && parsed.honors.trim()) {
      const prevHonors = prev.honors || [{ time: '', award: '' }];
      const hasPrevData = prevHonors.some(h => h.award?.trim());
      const items = parsed.honors.split(/[、,，\n]/).map(s => s.trim()).filter(Boolean).map(s => {
        const parts = s.match(/^(\d{4}[./-]\d{1,2})\s+(.+)$/);
        if (parts) return { time: parts[1], award: parts[2] };
        return { time: '', award: s };
      });
      if (items.length > 0) {
        newProfile.honors = hasPrevData ? [...prevHonors, ...items] : items;
      }
    }
  }

  // 经历
  if (parsed.experiences) {
    const newExp = { ...prev.experiences };
    for (const typeKey of ['campus', 'work', 'project']) {
      if (parsed.experiences[typeKey] && parsed.experiences[typeKey].length > 0) {
        // 过滤掉空条目
        const validItems = parsed.experiences[typeKey].filter(e => e.organization || e.content);
        if (validItems.length > 0) {
          const prevItems = newExp[typeKey] || [createEmptyExperience()];
          const hasPrevData = prevItems.some(e => e.organization?.trim() || e.content?.trim());
          if (!hasPrevData) {
            newExp[typeKey] = validItems;
          } else {
            newExp[typeKey] = [...prevItems, ...validItems];
          }
        }
      }
    }
    newProfile.experiences = newExp;
  }

  // 技能（包括语言）
  if (parsed.skills) {
    const newSkills = { ...prev.skills };
    for (const [catKey, items] of Object.entries(parsed.skills)) {
      if (catKey === 'language') {
        // 语言技能：parsed可能是数组如["英语 CET-6:580","日语 N2:150"]或对象
        if (Array.isArray(items) && items.length > 0) {
          const prevLangs = newSkills.language || [];
          const parsedLangs = items.map(item => {
            if (typeof item === 'object' && item.name) return item;
            // 兼容字符串格式 "英语 CET-6:580" 或 "英语 CET-6"
            if (typeof item === 'string') {
              const parts = item.split(/[:：]/);
              return { name: parts[0].trim(), level: parts[1]?.trim() || '' };
            }
            return null;
          }).filter(Boolean);
          // 去重合并
          const merged = [...prevLangs];
          for (const pl of parsedLangs) {
            if (!merged.some(m => m.name === pl.name)) {
              merged.push(pl);
            }
          }
          newSkills.language = merged;
        }
      } else if (Array.isArray(items) && items.length > 0) {
        // 其他技能分类
        const prevItems = newSkills[catKey] || [];
        const parsedItems = items.map(item => {
          if (typeof item === 'object' && item.name) return item;
          if (typeof item === 'string') {
            const parts = item.split(/[:：]/);
            return { name: parts[0].trim(), level: parts[1]?.trim() || '' };
          }
          return null;
        }).filter(Boolean);
        const merged = [...prevItems];
        for (const pi of parsedItems) {
          if (!merged.some(m => m.name === pi.name)) {
            merged.push(pi);
          }
        }
        newSkills[catKey] = merged;
      }
    }
    newProfile.skills = newSkills;
  }

  // 语言能力（兼容旧格式 parsed.languages）
  if (parsed.languages && Array.isArray(parsed.languages) && parsed.languages.length > 0) {
    const prevLangs = newProfile.skills?.language || [];
    const parsedLangs = parsed.languages.map(l => {
      if (typeof l === 'object') {
        // { type: 'cet6', score: '580' } 格式
        if (l.type && l.score) {
          // 找到对应的label
          const langCat = SKILL_CATEGORIES.find(c => c.key === 'language');
          const opt = langCat?.options.find(o => o.value === l.type);
          const name = opt ? opt.label : l.type;
          return { name, level: l.score };
        }
        if (l.name) return { name: l.name, level: l.level || l.score || '' };
      }
      if (typeof l === 'string') {
        const parts = l.split(/[:：]/);
        return { name: parts[0].trim(), level: parts[1]?.trim() || '' };
      }
      return null;
    }).filter(Boolean);

    const merged = [...prevLangs];
    for (const pl of parsedLangs) {
      if (!merged.some(m => m.name === pl.name)) {
        merged.push(pl);
      }
    }
    newProfile.skills = { ...newProfile.skills, language: merged };
  }

  return newProfile;
}
