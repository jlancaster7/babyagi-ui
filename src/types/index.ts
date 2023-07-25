import { Agent } from 'http';
import { type } from 'os';

export type SelectItem = {
  id: string;
  name: string;
  message?: string;
  icon?: string;
  badge?: string;
};

export type MessageBlock = {
  id?: number;
  messages: Message[];
  status?: 'complete' | 'incomplete' | 'running';
  type?: MessageType;
};

export type Message = {
  id?: number;
  text: string;
  type: MessageType;
  icon?: string;
  title?: string;
  bgColor?: string;
  status?: AgentStatus;
  open?: boolean;
  dependentTaskIds?: number[];
};

export type Execution = {
  id: string;
  name: string;
  params: ExecutionParams;
  messages: Message[];
  date: string;
  evaluation?: 'good' | 'bad';
};

export type ExecutionParams = {
  model: SelectItem;
  iterations: SelectItem;
  firstTask: string;
  objective: string;
  agent: AgentType;
};

export type AgentType = 'babyagi' | 'babybeeagi' | 'babycatagi' | 'none';

export type MessageType =
  | 'objective'
  | 'task-list'
  | 'next-task'
  | 'task-result'
  | 'task-output'
  | 'task-result-summary'
  | 'task-parameters'
  | 'search-logs'
  | 'loading'
  | 'end-of-iterations'
  | 'session-summary'
  | 'done'
  | 'complete'
  | 'failed'
  | 'sufficiency-result' // for mod
  | 'user-input' // for babydeeragi
  | 'task-execute' // for babydeeragi;
  | 'final-result';

export type AgentStatusType =
  | 'preparing'
  | 'creating'
  | 'executing'
  | 'prioritizing'
  | 'saving'
  | 'terminating'
  | 'finished'
  | 'ready'
  | 'closing'
  | 'updating'
  | 'summarizing'
  | 'managing'
  | 'creating-stream' // for babycatagi
  | 'executing-stream' // for babycatagi
  | 'sufficiency' // for mod
  | 'user-input'; // for babydeeragi

export type UserSettings = {
  openAIApiKey?: string;
  notifications?: boolean;
  enabledGPT4?: boolean;
};

export type UIState = {
  showSidebar: boolean;
};

export type ToolType =
  | 'web-scrape'
  | 'web-search'
  | 'text-completion'
  | 'user-input';
export type TaskStatus = 'complete' | 'incomplete' | 'running';

export interface AgentTask {
  parameters: ExecuteSkillParameters;
  id: number;
  task: string;
  tool: ToolType;
  dependentTaskIds?: number[];
  status: TaskStatus;
  output?: string; // for babycatagi
  result?: string; // for babybeeagi
  resultSummary?: string; // for babybeeagi
  dependentTaskId?: number; // for babybeeagi
  skill?: string; // for babyelfagi
  icon?: string; // for babyelfagi
}

export type AgentStatus = {
  type: AgentStatusType;
  message?: string;
};

export type TaskOutput = {
  completed: boolean;
  output: string | undefined;
};

export type TaskOutputs = {
  [id: number]: TaskOutput;
};

export type SkillInfo = {
  name: string;
  description: string;
  icon: string;
  badge?: string;
};
export type ExecuteSkillOutput = {
  output: string;
  parameters?: ExecuteSkillParameters;
};
export type ExecuteSkillParameters = {
  query?: string;
  symbol?: string;
  quarterList?: string[];
};

export type LLMParams = {
  openAIApiKey?: string;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  streaming?: boolean;
  callbacks?: any[];
};
export type SimilarDoc = {
  id: number;
  section: string;
  sectionPosition: number;
  text: string;
  score: number;
  fiscalQuarter: number;
  fiscalYear: number;
  calendarQuarter: number;
  calendarYear: number;
  docLink: string;
  title: string;
  subTitle: string;
  symbol: string;
  type: string;
  xPath: string | string[] | null;
  eventDate: string;
  asOfDate?: string;
};

export type TableInfo = {
  id: number;
  createdAt: Date;
  updatedAt: Date;
};

export type TranscriptTableWithDetail = {
  transcriptId: string;
  participantDescription: string;
  participantName: string;
  participantRole: string;
  session: string;
  speechPosition: number;
  hasEmbedding?: boolean;
  s3Location?: string;
  xPath: string | null;
  symbol: string;
  title: string;
  quarter: number;
  year: number;
  time: string;
  audio: string;
  s3HtmlUrl: string | null;
  calendarYear: number;
  calendarQuarter: number;
} & TableInfo;

export type FilingWithDetailTable = {
  filingListId: number;
  index: number;
  s3Location: string;
  part: string;
  subPart: string;
  lastHeader: string;
  xPaths: string[] | null;
  tableOfContentsDescription: string;
  symbol: string;
  filingType: string;
  calendarQuarter: number;
  calendarYear: number;
  fiscalQuarter: number;
  fiscalYear: number;
  reportDate: string;
  filingDate: string;
  htmlS3Url: string | null;
  partDescription: string | null;
  item: string | null;
  itemDescription: string | null;
} & TableInfo;

export enum FilingType {
  K = '10-K',
  Q = '10-Q',
  ER = 'ER',
  EightK = '8-K',
}

export type FilingTablesProcessedRecordWithDetailTable = {
  filingListId: number;
  index: number;
  s3Location: string;
  part: string | null;
  partDescription: string | null;
  item: string | null;
  itemDescription: string | null;
  lastHeader: string | null;
  xPath: string;
  symbol: string;
  calendarQuarter: number;
  calendarYear: number;
  filingDate: string;
  filingType: FilingType;
  fiscalQuarter: number;
  fiscalYear: number;
  reportDate: string;
  htmlS3Url: string;
} & TableInfo;
