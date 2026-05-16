export const announcements = [
  { id: 1, title: "Weekly Contest #42 - Sunday 10 AM", date: "2026-05-04", tag: "Contest" },
  { id: 2, title: "New dynamic programming track released by Prof. Sharma", date: "2026-05-02", tag: "New" },
  { id: 3, title: "Mid-sem coding evaluation deadline: May 10", date: "2026-04-30", tag: "Deadline" },
];

export type Difficulty = "Easy" | "Medium" | "Hard";
export type StudentProblemStatus = "solved" | "attempted" | "todo";

export type ProblemExample = {
  input: string;
  output: string;
  hidden: boolean;
  explanation?: string;
};

export type ProblemRecord = {
  id: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  acceptance: number;
  status: StudentProblemStatus;
  submissions: number;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
  examples: ProblemExample[];
  timeLimit: string;
  memoryLimit: string;
};

export const problems: ProblemRecord[] = [
  {
    id: "p001",
    title: "Two Sum",
    difficulty: "Easy",
    tags: ["Array", "Hash Map"],
    acceptance: 78,
    status: "solved",
    submissions: 1240,
    statement: "Given an integer array nums and an integer target, return the indices of the two distinct values whose sum equals target.",
    inputFormat: "The first line contains the list of integers. The second line contains the target value.",
    outputFormat: "Print the two zero-based indices in any order.",
    constraints: ["2 <= nums.length <= 10^4", "-10^9 <= nums[i] <= 10^9", "Exactly one valid answer exists."],
    examples: [
      { input: "nums = [2, 7, 11, 15], target = 9", output: "[0, 1]", hidden: false },
      { input: "nums = [3, 2, 4], target = 6", output: "[1, 2]", hidden: false },
      { input: "nums = [1, 5, 1, 5], target = 10", output: "[1, 3]", hidden: true },
    ],
    timeLimit: "1",
    memoryLimit: "256",
  },
  {
    id: "p002",
    title: "Reverse Linked List",
    difficulty: "Easy",
    tags: ["Linked List"],
    acceptance: 71,
    status: "solved",
    submissions: 980,
    statement: "Reverse a singly linked list and return the new head while preserving all node values.",
    inputFormat: "The input contains the number of nodes followed by the node values in order.",
    outputFormat: "Print the values of the reversed linked list from head to tail.",
    constraints: ["0 <= n <= 5000", "-5000 <= node.val <= 5000"],
    examples: [
      { input: "head = [1, 2, 3, 4, 5]", output: "[5, 4, 3, 2, 1]", hidden: false },
      { input: "head = [1, 2]", output: "[2, 1]", hidden: false },
      { input: "head = []", output: "[]", hidden: true },
    ],
    timeLimit: "1",
    memoryLimit: "256",
  },
  {
    id: "p003",
    title: "Longest Substring Without Repeating",
    difficulty: "Medium",
    tags: ["String", "Sliding Window"],
    acceptance: 42,
    status: "attempted",
    submissions: 1502,
    statement: "Find the length of the longest substring that contains no repeated characters.",
    inputFormat: "A single string s is provided on one line.",
    outputFormat: "Print one integer representing the maximum valid substring length.",
    constraints: ["0 <= s.length <= 5 * 10^4", "s contains English letters, digits, symbols, and spaces."],
    examples: [
      { input: "s = \"abcabcbb\"", output: "3", hidden: false, explanation: "The longest substring is \"abc\"." },
      { input: "s = \"bbbbb\"", output: "1", hidden: false },
      { input: "s = \"pwwkew\"", output: "3", hidden: true },
    ],
    timeLimit: "1",
    memoryLimit: "256",
  },
  {
    id: "p004",
    title: "Median of Two Sorted Arrays",
    difficulty: "Hard",
    tags: ["Array", "Binary Search"],
    acceptance: 28,
    status: "todo",
    submissions: 612,
    statement: "Return the median of two sorted arrays in O(log(m + n)) time.",
    inputFormat: "Two sorted arrays are given on separate lines.",
    outputFormat: "Print the median value as an integer or decimal number.",
    constraints: ["0 <= m, n <= 1000", "1 <= m + n <= 2000", "-10^6 <= nums[i] <= 10^6"],
    examples: [
      { input: "nums1 = [1, 3], nums2 = [2]", output: "2.0", hidden: false },
      { input: "nums1 = [1, 2], nums2 = [3, 4]", output: "2.5", hidden: false },
      { input: "nums1 = [], nums2 = [1]", output: "1.0", hidden: true },
    ],
    timeLimit: "1",
    memoryLimit: "256",
  },
  {
    id: "p005",
    title: "Valid Parentheses",
    difficulty: "Easy",
    tags: ["Stack", "String"],
    acceptance: 81,
    status: "solved",
    submissions: 2310,
    statement: "Determine whether an expression containing brackets is valid and properly nested.",
    inputFormat: "A single string s containing only parentheses, brackets, and braces.",
    outputFormat: "Print true if the expression is valid; otherwise print false.",
    constraints: ["1 <= s.length <= 10^4", "s contains only ()[]{} characters."],
    examples: [
      { input: "s = \"()[]{}\"", output: "true", hidden: false },
      { input: "s = \"(]\"", output: "false", hidden: false },
      { input: "s = \"([{}])\"", output: "true", hidden: true },
    ],
    timeLimit: "1",
    memoryLimit: "256",
  },
  {
    id: "p006",
    title: "Merge K Sorted Lists",
    difficulty: "Hard",
    tags: ["Heap", "Linked List"],
    acceptance: 35,
    status: "todo",
    submissions: 540,
    statement: "Merge k sorted linked lists into one sorted linked list and return its head.",
    inputFormat: "The input contains k lists represented as arrays of ascending integers.",
    outputFormat: "Print the merged sorted list as an array.",
    constraints: ["0 <= k <= 10^4", "0 <= total nodes <= 10^4", "-10^4 <= value <= 10^4"],
    examples: [
      { input: "lists = [[1, 4, 5], [1, 3, 4], [2, 6]]", output: "[1, 1, 2, 3, 4, 4, 5, 6]", hidden: false },
      { input: "lists = []", output: "[]", hidden: false },
      { input: "lists = [[-2], [-1], [0]]", output: "[-2, -1, 0]", hidden: true },
    ],
    timeLimit: "2",
    memoryLimit: "256",
  },
  {
    id: "p007",
    title: "Coin Change",
    difficulty: "Medium",
    tags: ["DP"],
    acceptance: 49,
    status: "attempted",
    submissions: 1102,
    statement: "Given coin denominations and a target amount, compute the minimum number of coins required to make that amount.",
    inputFormat: "The first line contains the coin denominations. The second line contains the target amount.",
    outputFormat: "Print the minimum count of coins, or -1 if the amount cannot be formed.",
    constraints: ["1 <= coins.length <= 12", "1 <= coins[i] <= 2^31 - 1", "0 <= amount <= 10^4"],
    examples: [
      { input: "coins = [1, 2, 5], amount = 11", output: "3", hidden: false, explanation: "11 = 5 + 5 + 1" },
      { input: "coins = [2], amount = 3", output: "-1", hidden: false },
      { input: "coins = [1], amount = 0", output: "0", hidden: true },
    ],
    timeLimit: "1",
    memoryLimit: "256",
  },
  {
    id: "p008",
    title: "Word Ladder",
    difficulty: "Hard",
    tags: ["BFS", "Graph"],
    acceptance: 31,
    status: "todo",
    submissions: 478,
    statement: "Find the length of the shortest transformation sequence from beginWord to endWord by changing one letter at a time.",
    inputFormat: "You are given beginWord, endWord, and a dictionary of allowed intermediate words.",
    outputFormat: "Print the number of words in the shortest valid transformation sequence. Print 0 if no sequence exists.",
    constraints: ["1 <= word length <= 10", "All words have the same length.", "The dictionary contains unique lowercase words."],
    examples: [
      { input: "beginWord = \"hit\", endWord = \"cog\", wordList = [\"hot\", \"dot\", \"dog\", \"lot\", \"log\", \"cog\"]", output: "5", hidden: false },
      { input: "beginWord = \"hit\", endWord = \"cog\", wordList = [\"hot\", \"dot\", \"dog\", \"lot\", \"log\"]", output: "0", hidden: false },
      { input: "beginWord = \"talk\", endWord = \"tail\", wordList = [\"talk\", \"tall\", \"tail\"]", output: "3", hidden: true },
    ],
    timeLimit: "2",
    memoryLimit: "256",
  },
  {
    id: "p009",
    title: "Number of Islands",
    difficulty: "Medium",
    tags: ["DFS", "Graph"],
    acceptance: 56,
    status: "solved",
    submissions: 1320,
    statement: "Count the number of connected components of land cells in a binary grid.",
    inputFormat: "A matrix of 0s and 1s is provided, where 1 denotes land and 0 denotes water.",
    outputFormat: "Print one integer representing the number of islands.",
    constraints: ["1 <= rows, cols <= 300", "grid[i][j] is either 0 or 1."],
    examples: [
      { input: "grid = [[1,1,1,1,0],[1,1,0,1,0],[1,1,0,0,0],[0,0,0,0,0]]", output: "1", hidden: false },
      { input: "grid = [[1,1,0,0,0],[1,1,0,0,0],[0,0,1,0,0],[0,0,0,1,1]]", output: "3", hidden: false },
      { input: "grid = [[0,0,0],[0,0,0]]", output: "0", hidden: true },
    ],
    timeLimit: "1",
    memoryLimit: "256",
  },
  {
    id: "p010",
    title: "Climbing Stairs",
    difficulty: "Easy",
    tags: ["DP"],
    acceptance: 84,
    status: "solved",
    submissions: 2780,
    statement: "Count the number of distinct ways to reach the nth stair when you can climb 1 or 2 steps at a time.",
    inputFormat: "A single integer n is given.",
    outputFormat: "Print the number of valid ways to reach stair n.",
    constraints: ["1 <= n <= 45"],
    examples: [
      { input: "n = 2", output: "2", hidden: false },
      { input: "n = 3", output: "3", hidden: false },
      { input: "n = 5", output: "8", hidden: true },
    ],
    timeLimit: "1",
    memoryLimit: "128",
  },
  {
    id: "p011",
    title: "Course Schedule",
    difficulty: "Medium",
    tags: ["Graph", "Topo Sort"],
    acceptance: 47,
    status: "todo",
    submissions: 902,
    statement: "Determine whether all courses can be completed given their prerequisite pairs.",
    inputFormat: "The input contains the number of courses followed by prerequisite pairs [course, prerequisite].",
    outputFormat: "Print true if all courses can be completed; otherwise print false.",
    constraints: ["1 <= numCourses <= 2000", "0 <= prerequisites.length <= 5000"],
    examples: [
      { input: "numCourses = 2, prerequisites = [[1, 0]]", output: "true", hidden: false },
      { input: "numCourses = 2, prerequisites = [[1, 0], [0, 1]]", output: "false", hidden: false },
      { input: "numCourses = 4, prerequisites = [[1, 0], [2, 1], [3, 2]]", output: "true", hidden: true },
    ],
    timeLimit: "1",
    memoryLimit: "256",
  },
  {
    id: "p012",
    title: "Trapping Rain Water",
    difficulty: "Hard",
    tags: ["Array", "Two Pointers"],
    acceptance: 39,
    status: "attempted",
    submissions: 720,
    statement: "Given elevation heights, compute how much water is trapped after raining.",
    inputFormat: "A single array of non-negative integers representing the elevation map.",
    outputFormat: "Print the total volume of trapped rain water.",
    constraints: ["1 <= height.length <= 2 * 10^4", "0 <= height[i] <= 10^5"],
    examples: [
      { input: "height = [0,1,0,2,1,0,1,3,2,1,2,1]", output: "6", hidden: false },
      { input: "height = [4,2,0,3,2,5]", output: "9", hidden: false },
      { input: "height = [2,0,2]", output: "2", hidden: true },
    ],
    timeLimit: "1",
    memoryLimit: "256",
  },
];

export const recentSubmissions = [
  { id: "s1", problem: "Two Sum", lang: "C++", status: "Accepted", runtime: "4 ms", time: "2 min ago" },
  { id: "s2", problem: "Coin Change", lang: "Python", status: "Wrong Answer", runtime: "\u2014", time: "12 min ago" },
  { id: "s3", problem: "Number of Islands", lang: "Java", status: "Accepted", runtime: "18 ms", time: "1 h ago" },
  { id: "s4", problem: "Climbing Stairs", lang: "C++", status: "Accepted", runtime: "0 ms", time: "Yesterday" },
];

export const leaderboard = [
  { rank: 1, name: "Aarav Mehta", roll: "TCET21CO001", solved: 312, score: 9840, accuracy: 88 },
  { rank: 2, name: "Diya Patel", roll: "TCET21CO014", solved: 298, score: 9420, accuracy: 91 },
  { rank: 3, name: "Rohan Iyer", roll: "TCET21CO022", solved: 281, score: 9105, accuracy: 84 },
  { rank: 4, name: "Sara Khan", roll: "TCET22CO007", solved: 254, score: 8520, accuracy: 79 },
  { rank: 5, name: "Kabir Nair", roll: "TCET22CO033", solved: 241, score: 8210, accuracy: 82 },
  { rank: 6, name: "Aditi Joshi", roll: "TCET22CO041", solved: 233, score: 7990, accuracy: 76 },
  { rank: 7, name: "Vivaan Rao", roll: "TCET23CO005", solved: 220, score: 7640, accuracy: 81 },
  { rank: 8, name: "Isha Verma", roll: "TCET23CO011", solved: 211, score: 7390, accuracy: 78 },
  { rank: 9, name: "Arjun Singh", roll: "TCET23CO019", solved: 198, score: 7050, accuracy: 74 },
  { rank: 10, name: "Meera Shah", roll: "TCET23CO028", solved: 187, score: 6820, accuracy: 80 },
];

export const studentProfile = {
  name: "Aarav Mehta",
  roll: "TCET21CO001",
  branch: "Computer Engineering",
  year: "Final Year",
  email: "aarav.mehta@tcetmumbai.in",
  rank: 1,
  solved: 312,
  submissions: 1284,
  accuracy: 88,
  streak: 47,
  badges: [
    { name: "DP Master", icon: "\uD83E\uDDE0", desc: "Solved 50+ DP problems" },
    { name: "Graph Guru", icon: "\u2699\uFE0F", desc: "Solved 30+ graph problems" },
    { name: "100 Day Streak", icon: "\uD83D\uDD25", desc: "Coded 100 days in a row" },
    { name: "Contest Winner", icon: "\uD83C\uDFC6", desc: "Topped Weekly Contest #38" },
    { name: "Early Bird", icon: "\uD83C\uDF05", desc: "First 10 to solve a Hard" },
  ],
};

export const facultyStats = {
  problemsCreated: 47,
  totalSubmissions: 12480,
  activeStudents: 326,
  avgAccuracy: 67,
};

export const facultyProblems = problems.map((problem, index) => ({
  ...problem,
  status: index % 4 === 0 ? "Draft" : "Published",
  totalSubmissions: 100 + index * 87,
  lastUpdated: `2026-05-${String((index % 7) + 1).padStart(2, "0")}`,
}));

export const facultySubmissions = [
  { id: "f1", student: "Aarav Mehta", roll: "TCET21CO001", problem: "Two Sum", lang: "C++", status: "Accepted", runtime: "4 ms", memory: "8.1 MB", at: "2026-05-04 10:21" },
  { id: "f2", student: "Diya Patel", roll: "TCET21CO014", problem: "Coin Change", lang: "Python", status: "Wrong Answer", runtime: "\u2014", memory: "\u2014", at: "2026-05-04 10:18" },
  { id: "f3", student: "Rohan Iyer", roll: "TCET21CO022", problem: "Number of Islands", lang: "Java", status: "Accepted", runtime: "18 ms", memory: "42 MB", at: "2026-05-04 10:05" },
  { id: "f4", student: "Sara Khan", roll: "TCET22CO007", problem: "Word Ladder", lang: "C++", status: "TLE", runtime: "\u2014", memory: "\u2014", at: "2026-05-04 09:51" },
  { id: "f5", student: "Kabir Nair", roll: "TCET22CO033", problem: "Trapping Rain Water", lang: "C++", status: "Accepted", runtime: "9 ms", memory: "10.4 MB", at: "2026-05-04 09:42" },
  { id: "f6", student: "Aditi Joshi", roll: "TCET22CO041", problem: "Course Schedule", lang: "Python", status: "Accepted", runtime: "120 ms", memory: "16 MB", at: "2026-05-04 09:30" },
  { id: "f7", student: "Vivaan Rao", roll: "TCET23CO005", problem: "Climbing Stairs", lang: "Java", status: "Runtime Error", runtime: "\u2014", memory: "\u2014", at: "2026-05-04 09:15" },
];

export function getProblem(id: string) {
  return problems.find((problem) => problem.id === id) ?? problems[0];
}

export function getFacultyProblem(id: string) {
  return facultyProblems.find((problem) => problem.id === id) ?? facultyProblems[0];
}
