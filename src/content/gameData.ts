import {
  ChapterDef,
  ChapterTheme,
  EndingDef,
  EndingId,
  ItemKind,
  MartialArtId,
  MartialArtSpec,
  TileKind,
} from '../systems/types.js';

export const MARTIAL_ARTS: MartialArtSpec[] = [
  {
    id: 0,
    name: '청운검법',
    hanja: '靑雲劍法',
    desc: '균형 잡힌 정파 기본 검식. 빠른 선딜과 안정적인 내력 순환.',
    qiCost: 0,
    cooldownMs: 320,
    windupMs: 110,
    activeMs: 140,
    recoveryMs: 160,
    skillMult: 1.0,
    poiseDamage: 18,
    range: 2.3,
    kind: 'MELEE',
    color: '#60a5fa',
  },
  {
    id: 1,
    name: '파천구검',
    hanja: '破天九劍',
    desc: '은거 고수가 전수한 절학. 관통하는 검기 투사체를 전방으로 발사.',
    qiCost: 22,
    cooldownMs: 1100,
    windupMs: 130,
    activeMs: 120,
    recoveryMs: 180,
    skillMult: 1.65,
    poiseDamage: 32,
    range: 9.0,
    kind: 'PROJECTILE',
    color: '#fbbf24',
  },
  {
    id: 2,
    name: '영사검법',
    hanja: '靈蛇劍法',
    desc: '쾌검 난무로 적의 자세(포이즈)를 순식간에 무너뜨리는 연격.',
    qiCost: 18,
    cooldownMs: 850,
    windupMs: 80,
    activeMs: 160,
    recoveryMs: 140,
    skillMult: 1.45,
    poiseDamage: 46,
    range: 2.7,
    kind: 'MELEE',
    color: '#c084fc',
  },
  {
    id: 3,
    name: '흡원대법',
    hanja: '吸元大法',
    desc: '주위 적의 진기를 빨아들여 광역 타격과 동시에 체력·내력을 회복.',
    qiCost: 25,
    cooldownMs: 2200,
    windupMs: 160,
    activeMs: 180,
    recoveryMs: 200,
    skillMult: 1.35,
    poiseDamage: 36,
    range: 3.6,
    kind: 'DRAIN_AOE',
    color: '#f43f5e',
  },
  {
    id: 4,
    name: '자하심법',
    hanja: '紫霞心法',
    desc: '내공 운기조식으로 상처를 치유하고 10초간 공격력을 35% 증폭.',
    qiCost: 30,
    cooldownMs: 4000,
    windupMs: 180,
    activeMs: 100,
    recoveryMs: 160,
    skillMult: 0,
    poiseDamage: 0,
    range: 0,
    kind: 'HEAL_BUFF',
    color: '#34d399',
  },
];

export const ITEM_LABELS: Record<ItemKind, string> = {
  HP_POTION: '금창약 (체력 +140)',
  QI_PILL: '청심단 (내력 +80)',
  ATK_ELIXIR: '백초단 (공격력 버프)',
  SECRET_KEY: '고성 옥패 열쇠',
};

export const ENDINGS: Record<EndingId, EndingDef> = {
  em1: {
    id: 'em1',
    title: '제1결말: 청운맹주 (靑雲盟主)',
    subtitle: '정파의 질서를 바로세우고 강호의 맹주로 추대되다',
    lines: [
      '매화장의 붉은 안개가 걷히고, 오랜 음모의 뿌리가 마침내 끊어졌다.',
      '임청운은 정파 각 문파의 추대를 받아 새로운 강호 맹주에 올랐다.',
      '검은 피를 부르기 위함이 아니라 평화를 지키기 위함이라 선언하며, 강호는 새 시대를 맞았다.',
    ],
    accentColor: '#fbbf24',
  },
  em2: {
    id: 'em2',
    title: '제2결말: 은거소요 (隱居逍遙)',
    subtitle: '명예를 내려놓고 산수로 돌아가 피리와 거문고를 타다',
    lines: [
      '천하 제일의 검보를 손에 넣었으나, 임청운은 미련 없이 문파의 인장을 내려놓았다.',
      '백매화가 흩날리는 남쪽 계곡에서, 오랜 벗들과 차를 나누며 한 곡의 소오곡을 합주했다.',
      '검을 버린 자만이 진정한 자유를 얻는 법. 그의 웃음소리가 산골짜기에 울려 퍼졌다.',
    ],
    accentColor: '#34d399',
  },
  em3: {
    id: 'em3',
    title: '제3결말: 혈풍재림 (血風再臨)',
    subtitle: '금단의 심법에 취해 또 다른 패권의 소용돌이에 서다',
    lines: [
      '적장의 패도를 꺾기 위해 연마한 흡원대법이 오히려 마음을 잠식했다.',
      '매화장의 주인은 쓰러졌으나, 붉은 검기는 이제 임청운의 손끝에서 일렁이고 있었다.',
      '강호인들은 새로운 패자의 등장을 두려워하며, 밤하늘의 붉은 달을 올려다보았다.',
    ],
    accentColor: '#f43f5e',
  },
  d9: {
    id: 'd9',
    title: '진엔딩: 매화낙화 (梅花落花)',
    subtitle: '모든 12관문의 인연을 매듭짓고 강호의 전설이 되다',
    lines: [
      '12관문의 시련을 넘어, 매화장 내전의 최후 결전에서 파천구검의 극의가 빛났다.',
      '적장 홍련군주는 쓰러지며 "진정한 강호의 주인은 검이 아니라 마음"이라는 말을 남겼다.',
      '임청운은 흩날리는 매화 꽃잎 속에서 모든 은원을 풀고, 전설의 유협으로 남았다.',
    ],
    accentColor: '#f472b6',
  },
};

export const CHAPTERS: ChapterDef[] = [
  {
    id: 0,
    code: 'CH1',
    title: '제1장: 청운산문 (靑雲山門)',
    subtitle: '사부님의 부름과 강호 출사의 서막',
    theme: 'MOUNTAIN',
    mapW: 26,
    mapH: 26,
    spawnX: 5,
    spawnY: 13,
    objective: '연무장 수련 후, 청운산문 장문인(현암 진인)과 대화하여 하산 명을 받으세요.',
    introDialogue: [
      { speaker: '임청운', role: 'PLAYER', text: '오늘따라 산문 밖 바람이 심상치 않구나. 사부님께 여쭈어 보아야겠다.' },
    ],
    npcs: [
      {
        id: 'npc_ch1_master',
        name: '현암 진인',
        title: '청운파 장문인',
        role: 'MASTER',
        x: 13,
        y: 8,
        dialogue: [
          { speaker: '현암 진인', role: 'MASTER', text: '청운아, 근래 하남 일대에서 정체불명의 흑의 무리들이 준동하고 있다.' },
          { speaker: '현암 진인', role: 'MASTER', text: '네가 낙양 객잔으로 내려가 표국의 행방을 살피고 오너라. 자하심법의 기초를 일러주마.' },
        ],
        rewardArtId: 4,
      },
      {
        id: 'npc_ch1_girl',
        name: '소연',
        title: '사매',
        role: 'ALLY_HEROINE',
        x: 9,
        y: 12,
        dialogue: [
          { speaker: '소연', role: 'ALLY_HEROINE', text: '사형, 하산하실 때 앞마당 상자의 금창약을 꼭 챙기세요! 경공(X/점프)과 패링(Q/방어)도 잊지 마시고요.' },
        ],
        rewardItem: 'HP_POTION',
      },
    ],
    enemies: [
      { id: 'e_ch1_1', name: '산문 침입자', role: 'ENEMY_RAIDER', kind: 'RAIDER', x: 18, y: 15, maxHp: 110, attackPower: 18, defense: 6, maxPoise: 45, expReward: 40 },
    ],
    chests: [
      { id: 'c_ch1_1', x: 8, y: 18, item: 'HP_POTION', label: '금창약' },
      { id: 'c_ch1_2', x: 18, y: 8, item: 'QI_PILL', label: '청심단' },
    ],
    portals: [{ x: 22, y: 13, targetChapter: 1, targetX: 4, targetY: 13, label: '낙양 객잔으로' }],
  },
  {
    id: 1,
    code: 'CH2',
    title: '제2장: 낙양 객잔 (洛陽客棧)',
    subtitle: '객잔 주모의 제보와 호위 의뢰',
    theme: 'INN',
    mapW: 26,
    mapH: 26,
    spawnX: 4,
    spawnY: 13,
    objective: '객잔에 난입한 흑풍단 척후를 물리치고, 객잔 주모 및 소년 협객과 대화하세요.',
    npcs: [
      {
        id: 'npc_ch2_inn',
        name: '백씨 주모',
        title: '낙양 객잔 주인',
        role: 'INNKEEPER',
        x: 11,
        y: 9,
        dialogue: [
          { speaker: '백씨 주모', role: 'INNKEEPER', text: '어휴, 협객님! 흑풍단 놈들이 표국 도련님을 쫓아 여기까지 들이닥쳤어요.' },
          { speaker: '백씨 주모', role: 'INNKEEPER', text: '태행산 고개를 넘어 유 대협의 집으로 피신시켜 주셔야 합니다.' },
        ],
        rewardItem: 'QI_PILL',
      },
      {
        id: 'npc_ch2_escort',
        name: '임평우',
        title: '복위표국 소공자',
        role: 'ESCORT',
        x: 15,
        y: 12,
        isEscort: true,
        dialogue: [
          { speaker: '임평우', role: 'ESCORT', text: '고맙습니다! 저도 검을 쥐고 끝까지 뒤따르겠습니다.' },
        ],
      },
    ],
    enemies: [
      { id: 'e_ch2_1', name: '흑풍단 척후', role: 'ENEMY_RAIDER', kind: 'RAIDER', x: 16, y: 16, maxHp: 140, attackPower: 22, defense: 8, maxPoise: 55, expReward: 55 },
      { id: 'e_ch2_2', name: '흑풍단 조장', role: 'ENEMY_ELITE', kind: 'ELITE', x: 19, y: 10, maxHp: 210, attackPower: 28, defense: 12, maxPoise: 75, expReward: 90 },
    ],
    chests: [{ id: 'c_ch2_1', x: 6, y: 6, item: 'HP_POTION', label: '금창약' }],
    portals: [{ x: 22, y: 13, targetChapter: 2, targetX: 4, targetY: 13, label: '태행산 길목으로' }],
  },
  {
    id: 2,
    code: 'CH3',
    title: '제3장: 태행산 매복 (太行山 埋伏)',
    subtitle: '협곡을 가로막는 매복조 돌파',
    theme: 'FOREST',
    mapW: 28,
    mapH: 26,
    spawnX: 4,
    spawnY: 13,
    objective: '태행산 매복조 두목을 격파하고 동쪽 관문으로 돌파하세요.',
    npcs: [
      {
        id: 'npc_ch3_ally',
        name: '유림',
        title: '항산파 제자',
        role: 'ALLY_HEROINE',
        x: 10,
        y: 11,
        dialogue: [
          { speaker: '유림', role: 'ALLY_HEROINE', text: '임 공자님! 앞쪽 바위 틈에 흑풍단 매복이 있습니다. 저도 돕겠습니다.' },
        ],
      },
    ],
    enemies: [
      { id: 'e_ch3_1', name: '매복 척후 A', role: 'ENEMY_RAIDER', kind: 'RAIDER', x: 14, y: 9, maxHp: 150, attackPower: 24, defense: 10, maxPoise: 60, expReward: 60 },
      { id: 'e_ch3_2', name: '매복 척후 B', role: 'ENEMY_RAIDER', kind: 'RAIDER', x: 16, y: 17, maxHp: 150, attackPower: 24, defense: 10, maxPoise: 60, expReward: 60 },
      { id: 'e_ch3_boss', name: '철완 호법', role: 'ENEMY_ELITE', kind: 'BOSS', x: 21, y: 13, maxHp: 340, attackPower: 34, defense: 15, maxPoise: 95, expReward: 140, isBoss: true, unlocksPortal: true },
    ],
    chests: [{ id: 'c_ch3_1', x: 13, y: 21, item: 'ATK_ELIXIR', label: '백초단' }],
    portals: [{ x: 25, y: 13, targetChapter: 3, targetX: 4, targetY: 13, label: '형산 연회장으로', requiresBossClear: true }],
  },
  {
    id: 3,
    code: 'CH4',
    title: '제4장: 금분세수 연회 (金盆洗手)',
    subtitle: '금지된 합주곡과 정파의 균열',
    theme: 'MANOR',
    mapW: 26,
    mapH: 26,
    spawnX: 4,
    spawnY: 13,
    objective: '유정산 대협의 부탁을 들어 악보를 지키고 난입한 추격자를 막으세요.',
    npcs: [
      {
        id: 'npc_ch4_scholar',
        name: '유정산',
        title: '형산 원로',
        role: 'SCHOLAR',
        x: 13,
        y: 10,
        dialogue: [
          { speaker: '유정산', role: 'SCHOLAR', text: '강호의 은원을 씻고자 했으나 흑백의 대립이 끝내 날 놓아주지 않는구나.' },
          { speaker: '유정산', role: 'SCHOLAR', text: '이 영사검법의 운기법을 전할 테니 부디 살아남아 강호의 진실을 밝혀주게.' },
        ],
        rewardArtId: 2,
      },
    ],
    enemies: [
      { id: 'e_ch4_1', name: '숭산 집행자', role: 'ENEMY_ELITE', kind: 'ELITE', x: 18, y: 9, maxHp: 240, attackPower: 30, defense: 14, maxPoise: 85, expReward: 100 },
      { id: 'e_ch4_2', name: '숭산 첨병', role: 'ENEMY_RAIDER', kind: 'RAIDER', x: 18, y: 17, maxHp: 170, attackPower: 25, defense: 10, maxPoise: 65, expReward: 70 },
    ],
    chests: [{ id: 'c_ch4_1', x: 8, y: 7, item: 'QI_PILL', label: '청심단' }],
    portals: [{ x: 22, y: 13, targetChapter: 4, targetX: 4, targetY: 13, label: '대나무 숲 은거지로' }],
  },
  {
    id: 4,
    code: 'CH5',
    title: '제5장: 대나무 숲의 기연 (竹林奇緣)',
    subtitle: '은거 검선과의 만남, 파천구검 전수',
    theme: 'FOREST',
    mapW: 26,
    mapH: 26,
    spawnX: 4,
    spawnY: 13,
    objective: '대나무 숲 깊은 곳의 은거 검선(창해 노인)을 찾아 파천구검을 전수받으세요.',
    npcs: [
      {
        id: 'npc_ch5_elder',
        name: '창해 노인',
        title: '은거 검선',
        role: 'ELDER',
        x: 15,
        y: 12,
        dialogue: [
          { speaker: '창해 노인', role: 'ELDER', text: '무릇 검이란 초식에 얽매이지 않고 물 흐르듯 빈틈을 찌르는 법이다.' },
          { speaker: '창해 노인', role: 'ELDER', text: '좋다! 네 눈빛에 삿됨이 없으니 파천구검(2번 스킬)의 검기 방출을 전수하마!' },
        ],
        rewardArtId: 1,
      },
    ],
    enemies: [
      { id: 'e_ch5_1', name: '쾌도 백전', role: 'ENEMY_ELITE', kind: 'BOSS', x: 19, y: 16, maxHp: 380, attackPower: 36, defense: 16, maxPoise: 100, expReward: 160, isBoss: true, unlocksPortal: true },
    ],
    chests: [{ id: 'c_ch5_1', x: 11, y: 20, item: 'HP_POTION', label: '금창약' }],
    portals: [{ x: 23, y: 13, targetChapter: 5, targetX: 4, targetY: 13, label: '하남 야영지로', requiresBossClear: true }],
  },
  {
    id: 5,
    code: 'CH6',
    title: '제6장: 하남 야영지 (河南野營)',
    subtitle: '각성한 영웅과 몰려오는 흑풍단 본대',
    theme: 'MOUNTAIN',
    mapW: 28,
    mapH: 26,
    spawnX: 4,
    spawnY: 13,
    objective: '파천구검(2번)으로 흑풍단 정예대를 섬멸하고 고성 입구 열쇠를 확보하세요.',
    npcs: [
      {
        id: 'npc_ch6_inn',
        name: '강호 의원',
        title: '약초상',
        role: 'INNKEEPER',
        x: 8,
        y: 9,
        dialogue: [
          { speaker: '강호 의원', role: 'INNKEEPER', text: '부상이 깊어 보이는군요. 약재를 드릴 테니 숨을 고르고 나아가십시오.' },
        ],
        rewardItem: 'HP_POTION',
      },
    ],
    enemies: [
      { id: 'e_ch6_1', name: '흑풍단 창병', role: 'ENEMY_RAIDER', kind: 'RAIDER', x: 15, y: 9, maxHp: 210, attackPower: 28, defense: 12, maxPoise: 70, expReward: 80 },
      { id: 'e_ch6_2', name: '흑풍단 호위', role: 'ENEMY_ELITE', kind: 'ELITE', x: 18, y: 16, maxHp: 290, attackPower: 34, defense: 15, maxPoise: 90, expReward: 120 },
      { id: 'e_ch6_3', name: '흑풍단 부단주', role: 'ENEMY_ELITE', kind: 'ELITE', x: 22, y: 12, maxHp: 360, attackPower: 38, defense: 18, maxPoise: 105, expReward: 150 },
    ],
    chests: [{ id: 'c_ch6_1', x: 20, y: 7, item: 'SECRET_KEY', label: '고성 옥패 열쇠' }],
    portals: [{ x: 25, y: 13, targetChapter: 6, targetX: 4, targetY: 13, label: '고성 비밀통로로' }],
  },
  {
    id: 6,
    code: 'CH7',
    title: '제7장: 고성 비밀통로 (古城密道)',
    subtitle: '금단의 심법 흡원대법 발견',
    theme: 'CAVE',
    mapW: 26,
    mapH: 26,
    spawnX: 4,
    spawnY: 13,
    objective: '지하 석실의 비석에서 흡원대법을 해독하고 수문장을 격파하세요.',
    npcs: [
      {
        id: 'npc_ch7_scholar',
        name: '고성 서생',
        title: '전각 관리자',
        role: 'SCHOLAR',
        x: 12,
        y: 8,
        dialogue: [
          { speaker: '고성 서생', role: 'SCHOLAR', text: '이 석실에는 선대의 흡원대법(4번 스킬)이 새겨져 있습니다. 위급할 때 적의 진기를 거두십시오.' },
        ],
        rewardArtId: 3,
      },
    ],
    enemies: [
      { id: 'e_ch7_1', name: '지하 감시자', role: 'ENEMY_ELITE', kind: 'ELITE', x: 17, y: 14, maxHp: 340, attackPower: 36, defense: 18, maxPoise: 100, expReward: 140 },
      { id: 'e_ch7_2', name: '석실 수호자', role: 'ENEMY_RAIDER', kind: 'RAIDER', x: 19, y: 10, maxHp: 240, attackPower: 30, defense: 14, maxPoise: 75, expReward: 95 },
    ],
    chests: [{ id: 'c_ch7_1', x: 14, y: 20, item: 'ATK_ELIXIR', label: '백초단' }],
    portals: [{ x: 22, y: 13, targetChapter: 7, targetX: 4, targetY: 13, label: '명산 대치지로' }],
  },
  {
    id: 7,
    code: 'CH8',
    title: '제8장: 명산 대치 (名山對峙)',
    subtitle: '정파와 흑도의 전면 충돌',
    theme: 'MOUNTAIN',
    mapW: 28,
    mapH: 26,
    spawnX: 4,
    spawnY: 13,
    objective: '대치 중인 흑도 장로들을 물리치고 소연 사매를 구출하세요.',
    npcs: [
      {
        id: 'npc_ch8_girl',
        name: '소연',
        title: '청운파 사매',
        role: 'ALLY_HEROINE',
        x: 20,
        y: 10,
        dialogue: [
          { speaker: '소연', role: 'ALLY_HEROINE', text: '사형! 무사하셨군요! 적의 본거지 매화장으로 이어지는 지하 수로가 곧 열립니다.' },
        ],
        rewardItem: 'QI_PILL',
      },
    ],
    enemies: [
      { id: 'e_ch8_1', name: '흑도 좌호법', role: 'ENEMY_ELITE', kind: 'ELITE', x: 14, y: 12, maxHp: 390, attackPower: 40, defense: 20, maxPoise: 110, expReward: 165 },
      { id: 'e_ch8_2', name: '흑도 우호법', role: 'ENEMY_ELITE', kind: 'BOSS', x: 19, y: 16, maxHp: 460, attackPower: 44, defense: 22, maxPoise: 125, expReward: 210, isBoss: true, unlocksPortal: true },
    ],
    chests: [{ id: 'c_ch8_1', x: 9, y: 19, item: 'HP_POTION', label: '금창약' }],
    portals: [{ x: 25, y: 13, targetChapter: 8, targetX: 4, targetY: 13, label: '지하 수로로', requiresBossClear: true }],
  },
  {
    id: 8,
    code: 'CH9',
    title: '제9장: 지하 수로 (地下水道)',
    subtitle: '암흑 수로를 건너 매화장 외곽으로',
    theme: 'CAVE',
    mapW: 26,
    mapH: 26,
    spawnX: 4,
    spawnY: 13,
    objective: '나무 다리를 건너 수로 경비병을 제압하고 흑풍채로 진격하세요.',
    npcs: [],
    enemies: [
      { id: 'e_ch9_1', name: '수로 수비대장', role: 'ENEMY_ELITE', kind: 'ELITE', x: 14, y: 13, maxHp: 420, attackPower: 42, defense: 22, maxPoise: 115, expReward: 180 },
      { id: 'e_ch9_2', name: '암살자', role: 'ENEMY_RAIDER', kind: 'RAIDER', x: 18, y: 8, maxHp: 290, attackPower: 38, defense: 16, maxPoise: 85, expReward: 130 },
      { id: 'e_ch9_3', name: '암살자', role: 'ENEMY_RAIDER', kind: 'RAIDER', x: 18, y: 18, maxHp: 290, attackPower: 38, defense: 16, maxPoise: 85, expReward: 130 },
    ],
    chests: [{ id: 'c_ch9_1', x: 13, y: 6, item: 'QI_PILL', label: '청심단' }],
    portals: [{ x: 23, y: 13, targetChapter: 9, targetX: 4, targetY: 13, label: '흑풍채 요새로' }],
  },
  {
    id: 9,
    code: 'CH10',
    title: '제10장: 흑풍채 결전 (黑風寨)',
    subtitle: '거대한 음모의 배후를 꺾다',
    theme: 'MANOR',
    mapW: 28,
    mapH: 26,
    spawnX: 4,
    spawnY: 13,
    objective: '흑풍채주 뇌천호를 격파하고 매화장 외성으로 가는 길을 여세요.',
    npcs: [],
    enemies: [
      { id: 'e_ch10_1', name: '채주 친위대', role: 'ENEMY_ELITE', kind: 'ELITE', x: 14, y: 10, maxHp: 440, attackPower: 45, defense: 22, maxPoise: 120, expReward: 190 },
      { id: 'e_ch10_boss', name: '뇌천호 (흑풍채주)', role: 'BOSS_CRIMSON', kind: 'BOSS', x: 20, y: 13, maxHp: 620, attackPower: 52, defense: 26, maxPoise: 150, expReward: 320, isBoss: true, unlocksPortal: true },
    ],
    chests: [{ id: 'c_ch10_1', x: 9, y: 7, item: 'ATK_ELIXIR', label: '백초단' }],
    portals: [{ x: 25, y: 13, targetChapter: 10, targetX: 4, targetY: 13, label: '매화장 외성으로', requiresBossClear: true }],
  },
  {
    id: 10,
    code: 'CH11',
    title: '제11장: 매화장 외성 (梅花莊 外城)',
    subtitle: '붉은 매화 흩날리는 결전의 전초전',
    theme: 'PLUM_HALL',
    mapW: 28,
    mapH: 26,
    spawnX: 4,
    spawnY: 13,
    objective: '매화장 사대 호법을 돌파하고 내전 대문에 도달하세요.',
    npcs: [
      {
        id: 'npc_ch11_elder',
        name: '창해 노인',
        title: '은거 검선',
        role: 'ELDER',
        x: 7,
        y: 11,
        dialogue: [
          { speaker: '창해 노인', role: 'ELDER', text: '드디어 여기까지 왔구나. 내전 안의 홍련군주는 적색 공격(패링 가능)과 자색 광역(경공 회피)을 섞어 쓴다. 침착하게 응수하거라!' },
        ],
        rewardItem: 'HP_POTION',
      },
    ],
    enemies: [
      { id: 'e_ch11_1', name: '매화장 호법 갑', role: 'ENEMY_ELITE', kind: 'ELITE', x: 15, y: 9, maxHp: 480, attackPower: 48, defense: 24, maxPoise: 130, expReward: 220 },
      { id: 'e_ch11_2', name: '매화장 호법 을', role: 'ENEMY_ELITE', kind: 'ELITE', x: 18, y: 17, maxHp: 480, attackPower: 48, defense: 24, maxPoise: 130, expReward: 220 },
    ],
    chests: [{ id: 'c_ch11_1', x: 12, y: 20, item: 'QI_PILL', label: '청심단' }],
    portals: [{ x: 25, y: 13, targetChapter: 11, targetX: 4, targetY: 13, label: '매화장 내전(최종전)으로' }],
  },
  {
    id: 11,
    code: 'CH12',
    title: '제12장: 매화장 내전 (최종 결전)',
    subtitle: '홍련군주와의 최후 일전',
    theme: 'PLUM_HALL',
    mapW: 30,
    mapH: 28,
    spawnX: 5,
    spawnY: 14,
    objective: '최종 보스 홍련군주를 격파하여 강호의 운명을 결정지으세요!',
    introDialogue: [
      { speaker: '홍련군주', role: 'BOSS_CRIMSON', text: '여기까지 살아남은 것을 치하하마. 허나 천하의 패권은 오직 내 검 아래 놓일 뿐!' },
    ],
    npcs: [],
    enemies: [
      {
        id: 'e_ch12_boss',
        name: '홍련군주 (매화장주)',
        role: 'BOSS_CRIMSON',
        kind: 'BOSS',
        x: 20,
        y: 14,
        maxHp: 980,
        attackPower: 62,
        defense: 30,
        maxPoise: 180,
        expReward: 1000,
        isBoss: true,
        triggersEnding: 'd9',
      },
    ],
    chests: [
      { id: 'c_ch12_1', x: 10, y: 7, item: 'HP_POTION', label: '금창약' },
      { id: 'c_ch12_2', x: 10, y: 21, item: 'ATK_ELIXIR', label: '백초단' },
    ],
    portals: [],
  },
];

export function buildChapterGrid(ch: ChapterDef): TileKind[][] {
  const grid: TileKind[][] = [];
  const floor: TileKind =
    ch.theme === 'INN'
      ? 'WOOD'
      : ch.theme === 'FOREST'
        ? 'GRASS'
        : ch.theme === 'CAVE'
          ? 'DIRT'
          : 'STONE';

  for (let y = 0; y < ch.mapH; y += 1) {
    const row: TileKind[] = [];
    for (let x = 0; x < ch.mapW; x += 1) {
      const isBorder = x === 0 || y === 0 || x === ch.mapW - 1 || y === ch.mapH - 1;
      if (isBorder) {
        row.push(ch.theme === 'FOREST' ? 'BAMBOO' : ch.theme === 'CAVE' ? 'ROCK' : 'WALL_RED');
        continue;
      }
      // 테마별 장식 장애물 (경로 보장: 중앙 y=12..15는 비움)
      const inMainLane = Math.abs(y - Math.floor(ch.mapH / 2)) <= 2;
      if (!inMainLane && ((x * 7 + y * 13 + ch.id * 5) % 19 === 0)) {
        if (ch.theme === 'PLUM_HALL') row.push('PLUM_TREE');
        else if (ch.theme === 'FOREST') row.push('BAMBOO');
        else if (ch.theme === 'CAVE') row.push('ROCK');
        else if (ch.theme === 'MANOR') row.push('PLUM_TREE');
        else row.push('ROCK');
        continue;
      }
      // 제9장 지하 수로 물길 + 다리
      if (ch.id === 8 && x >= 10 && x <= 12) {
        if (Math.abs(y - 13) <= 1) row.push('BRIDGE');
        else row.push('WATER');
        continue;
      }
      row.push(floor);
    }
    grid.push(row);
  }

  for (const p of ch.portals) {
    if (grid[p.y]?.[p.x]) grid[p.y][p.x] = 'PORTAL';
  }
  for (const c of ch.chests) {
    if (grid[c.y]?.[c.x]) grid[c.y][c.x] = 'CHEST';
  }
  return grid;
}

export function isTileWalkable(tile: TileKind, wz = 0): boolean {
  if (tile === 'WALL_RED' || tile === 'BAMBOO' || tile === 'PLUM_TREE') return false;
  if (tile === 'ROCK' || tile === 'WATER') return wz > 0.25; // 경공 도약으로 바위/물 도약 가능!
  return true;
}
