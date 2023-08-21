import _ from 'lodash';
import { AgentTask, ExecuteSkillOutput, Message, TaskOutputs } from '@/types';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { parseTasks } from '@/utils/task';
import { HumanChatMessage, SystemChatMessage } from 'langchain/schema';
import { getUserApiKey } from '@/utils/settings';
import { translate } from '@/utils/translate';
import { SkillRegistry } from './skillRegistry';
import { findMostRelevantExamplesByType } from '@/utils/objective';
import axios from 'axios';
import { textCompletionTool } from '@/agents/common/tools/textCompletionTool';

export class TaskRegistry {
  tasks: AgentTask[];
  verbose: boolean = false;

  constructor(verbose = false) {
    this.tasks = [];
    this.verbose = verbose;
  }

  async createTaskList(
    objective: string,
    skillDescriptions: string,
    modelName: string = 'gpt-3.5-turbo',
    messageCallback?: (message: Message) => void,
    abortController?: AbortController,
    language: string = 'en',
    example?: { objective: string; tasks: AgentTask[] },
  ): Promise<void> {
    // let priorCriticismPrompt = '';
    // let taskListCommentary = ''
    // if (example?.tasks.length) {
    //   priorCriticismPrompt = `You are an expert task list creation AI tasked with creating a list of tasks as a JSON array, considering the ultimate objective of your team: ${objective}.
    //   AVAILABLE SKILLS: ${skillDescriptions}.
    //   The below is an objective and the task list that you previously created and executed to complete the objective.
    //   PRIOR:
    //     OBJECTIVE=${example.objective}
    //     TASK_LIST=${JSON.stringify(example.tasks.slice(0, example.tasks.length - 2).map(a => {
    //       return {
    //         id: a.id,
    //         task: a.task,
    //         skill: a.skill,
    //         result: a.result
    //       }
    //     }))}
    //     RESULT=${example.tasks[example.tasks.length - 1].result}
    //   What is one way that this task list could be improved?
    //   `
    //   taskListCommentary = await textCompletionTool(priorCriticismPrompt, 'gpt-3.5-turbo-16k', abortController?.signal)
    //   console.log(taskListCommentary)
    // } 



    let examplePrompt: string

    if (example?.tasks.length) {
      examplePrompt = `GUIDANCE:
      The below is an objective and a task list that you previously created and executed along with some commentary on how to improve this task list. 
      PRIOR:
      OBJECTIVE=${example.objective}
      TASK_LIST=${JSON.stringify(example.tasks.map(a => {
        return {
          id: a.id,
          task: a.task,
          skill: a.skill,
          icon: a.icon,
          dependent_task_ids: a.dependentTaskIds,
        }
      }))}

      `
    } else {
      const relevantObjective = await findMostRelevantExamplesByType(objective, 'objective');
      examplePrompt = `EXAMPLE: OBJECTIVE=${relevantObjective.objective}
      TASK_LIST=${JSON.stringify(relevantObjective.tasks)}`
    }

    const prompt = `
    You are an expert task list creation AI tasked with creating a list of tasks as a JSON array, considering the ultimate objective of your team: ${objective}.
    Create a very short task list based on the objective, the final output of the last task will be provided back to the user. 
    Limit tasks types to those that can be completed with the available skills listed below. Task description should be detailed.###
    AVAILABLE SKILLS: ${skillDescriptions}.###
    RULES:
    Do not use skills that are not listed.
    Always include one skill.
    Do not create files unless specified in the objective.
    dependent_task_ids should always be an empty array, or an array of numbers representing the task ID it should pull results from.
    Make sure all task IDs are in chronological order.###
    Output must be answered in ${language}.
    ${examplePrompt}

    OBJECTIVE=${objective}
    TASK_LIST=`;
    const systemPrompt = 'You are a task creation AI.';
    const systemMessage = new SystemChatMessage(systemPrompt);
    const messages = new HumanChatMessage(prompt);
    const openAIApiKey = getUserApiKey();

    if (!openAIApiKey && process.env.NEXT_PUBLIC_USE_USER_API_KEY === 'true') {
      throw new Error('User API key is not set.');
    }

    let result = '';
    if (openAIApiKey) {
      let chunk = '```json\n';
      const model = new ChatOpenAI(
        {
          openAIApiKey,
          modelName: 'gpt-3.5-turbo-16k',
          temperature: 0,
          maxTokens: 1500,
          topP: 1,
          verbose: this.verbose,
          streaming: true,
          callbacks: [
            {
              handleLLMNewToken(token: string) {
                chunk += token;
                const message: Message = {
                  type: 'task-execute',
                  title: translate('CREATING', 'message'),
                  text: chunk,
                  icon: '📝',
                  id: 0,
                };
                messageCallback?.(message);
              },
            },
          ],
        },
        { baseOptions: { signal: abortController?.signal } },
      );

      try {
        const response = await model.call([systemMessage, messages]);
        result = response.text;
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log('Task creation aborted');
        }
        console.log(error);
      }
    } else {
      // server side request
      const response = await axios
        .post(
          '/api/elf/completion',
          {
            prompt: prompt,
            model_name: modelName,
            temperature: 0,
            max_tokens: 1500,
          },
          {
            signal: abortController?.signal,
          },
        )
        .catch((error) => {
          if (error.name === 'AbortError') {
            console.log('Request aborted', error.message);
          } else {
            console.log(error.message);
          }
        });
      result = response?.data?.response;
    }

    if (result === undefined) {
      return;
    }

    this.tasks = parseTasks(result);
  }

  async executeTask(
    i: number,
    task: AgentTask,
    taskOutputs: TaskOutputs,
    objective: string,
    skillRegistry: SkillRegistry,
  ): Promise<ExecuteSkillOutput> {
    const skill = skillRegistry.getSkill(task.skill ?? '');
    const dependentTaskOutputs = task.dependentTaskIds
      ? task.dependentTaskIds.map((id) => `Task ${id} Output: ${taskOutputs[id].output}`).join('\n')
      : '';
    console.log('dependent task outputs', dependentTaskOutputs)
    if (skill.executionLocation === 'server') {
      // Call the API endpoint if the skill needs to be executed on the server side
      const response = await axios.post('/api/execute-skill', {
        task: JSON.stringify(task),
        dependent_task_outputs: dependentTaskOutputs,
        objective,
      });
      return {
        output: response.data.taskOutput,
        parameters: response.data.parameters,
      };
    } else {
      // Execute the skill on the client side
      let taskOutput = await skill.execute(
        task,
        dependentTaskOutputs,
        objective,
      );
      return { output: taskOutput.output, parameters: taskOutput.parameters };
    }
  }

  getTasks(): AgentTask[] {
    return this.tasks;
  }

  getTask(taskId: number): AgentTask | undefined {
    return this.tasks.find((task) => task.id === taskId);
  }

  addTask(task: AgentTask, afterTaskId: number): void {
    let index = this.tasks.findIndex((t) => t.id === afterTaskId);
    if (index !== -1) {
      this.tasks.splice(index + 1, 0, task);
    } else {
      this.tasks.push(task);
    }
  }

  updateTasks(taskUpdate: { id: number; updates: Partial<AgentTask> }): void {
    let task = this.getTask(taskUpdate.id);
    if (task) {
      Object.assign(task, taskUpdate.updates);
    }
  }

  reorderTasks(): void {
    this.tasks = _.sortBy(this.tasks, ['priority', 'task_id']);
  }

  async reflectOnOutput(
    objective: string,
    taskOutput: string,
    skillDescriptions: string,
    modelName: string = 'gpt-3.5-turbo-16k',
  ): Promise<[AgentTask[], number[], AgentTask[]]> {
    const example = [
      [
        {
          id: 3,
          task: 'New task 1 description',
          skill: 'text_completion',
          icon: '🤖',
          dependent_task_ids: [],
          status: 'complete',
        },
        {
          id: 4,
          task: 'New task 2 description',
          skill: 'text_completion',
          icon: '🤖',
          dependent_task_ids: [],
          status: 'incomplete',
        },
      ],
      [2, 3],
      [
        {
          id: 5,
          task: 'Complete the objective and provide a final report',
          skill: 'text_completion',
          icon: '🤖',
          dependent_task_ids: [1, 2, 3, 4],
          status: 'incomplete',
        },
      ],
    ];

    const prompt = `You are an expert task manager, review the task output to decide at least one new task to add.
  As you add a new task, see if there are any tasks that need to be updated (such as updating dependencies).
  Use the current task list as reference. 
  considering the ultimate objective of your team: ${objective}. 
  Do not add duplicate tasks to those in the current task list.
  Only provide JSON as your response without further comments.
  Every new and updated task must include all variables, even they are empty array.
  Dependent IDs must be smaller than the ID of the task.
  New tasks IDs should be no larger than the last task ID.
  Always select at least one skill.
  Task IDs should be unique and in chronological order.
  Do not change the status of complete tasks.
  Only add skills from the AVAILABLE SKILLS, using the exact same spelling.
  Provide your array as a JSON array with double quotes. The first object is new tasks to add as a JSON array, the second array lists the ID numbers where the new tasks should be added after (number of ID numbers matches array), The number of elements in the first and second arrays will always be the same. 
  And the third array provides the tasks that need to be updated.
  Make sure to keep dependent_task_ids key, even if an empty array.
  OBJECIVE: ${objective}.
  AVAILABLE SKILLS: ${skillDescriptions}.
  Here is the last task output: ${taskOutput}
  Here is the current task list: ${JSON.stringify(this.tasks)}
  EXAMPLE OUTPUT FORMAT = ${JSON.stringify(example)}
  OUTPUT = `;

    console.log(
      '\nReflecting on task output to generate new tasks if necessary...\n',
    );

    const model = new ChatOpenAI({
      openAIApiKey: getUserApiKey(),
      modelName,
      temperature: 0.7,
      maxTokens: 1500,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
    });

    const response = await model.call([
      new SystemChatMessage('You are a task creation AI.'),
      new HumanChatMessage(prompt),
    ]);

    const result = response.text;
    console.log('\n' + result);

    // Check if the returned result has the expected structure
    if (typeof result === 'string') {
      try {
        const taskList = JSON.parse(result);
        console.log(taskList);
        return [taskList[0], taskList[1], taskList[2]];
      } catch (error) {
        console.error(error);
      }
    } else {
      throw new Error('Invalid task list structure in the output');
    }

    return [[], [], []];
  }
}
