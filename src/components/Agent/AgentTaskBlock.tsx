import { AgentTask, MessageBlock } from '@/types';
import { FC } from 'react';
import { AgentCollapsible } from './AgentCollapsible';
import remarkGfm from 'remark-gfm';
import { AgentResult } from './AgentResult';
import { ReactMarkdown } from 'react-markdown/lib/react-markdown';
import { AgentLabelBlock } from './AgentLabelBlock';
import { AgentTaskStatus } from './AgentTastStatus';
import { AgentMessageInput } from './AgentMessageInput';

export interface AgentTaskProps {
  block: MessageBlock;
  userInputCallback: (id: number, input: string) => Promise<void>;
  task?: AgentTask
}

export const AgentTaskBlock: FC<AgentTaskProps> = ({ block, userInputCallback, task }) => {
  const message = block.messages[0];
  const nextMessage = block.messages[1];
  const id = block.id ?? 0;

  if (message === undefined) return null;

  if (nextMessage?.type === 'user-input') {
    return (
      <AgentMessageInput
        message={nextMessage}
        id={id}
        onSubmit={userInputCallback}
      />
    );
  }

  // task output
  const outputMessages = block.messages.filter(
    (message) =>
      message.type === 'task-output' || message.type === 'task-execute',
  );
  const logs = block.messages.filter(
    (message) => message.type === 'search-logs',
  );
  const parameters = block.messages.filter(
    (message) => message.type === 'task-parameters'
  ).map(a => JSON.parse(a.text));

  return message.type === 'next-task' ? (
    <div className="relative m-auto flex w-full flex-col gap-4 p-6 px-4 text-base text-neutral-900 dark:text-neutral-300 md:max-w-2xl md:gap-6 md:p-8 lg:max-w-2xl lg:px-0 xl:max-w-3xl">
      <div className="flex flex-col rounded-lg border border-neutral-200 dark:border-neutral-800">
        <div className="flex gap-4 p-6">
          <div className="flex aspect-square h-9 items-center justify-center rounded-full border border-neutral-200 text-lg dark:border-neutral-800">
            {message.icon}
          </div>
          <div className="focus:border-1 w-full pt-1.5 text-base font-medium focus:border-purple-500 focus:bg-white">
            <span>{message.text}</span>
          </div>
          <AgentTaskStatus block={block} />
        </div>
        {block.messages.length > 1 && (
          <AgentResult
            title="Task Details"
            dependencies={message.dependentTaskIds}
            isOpen={false}
          >
            <div className="flex flex-col gap-4 p-6">
              <div className="flex gap-4">
                <div className="flex aspect-square h-9 items-center justify-center text-lg">
                  {outputMessages[0]?.icon}
                </div>
                <div className="flex flex-col gap-8">
                  {outputMessages[0]?.text && (
                    <div className="prose prose-lg prose-neutral text-base w-full pt-1.5 dark:prose-invert prose-pre:bg-neutral-200 prose-pre:text-black dark:prose-pre:bg-neutral-800 dark:prose-pre:text-white">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {outputMessages[0]?.text}
                      </ReactMarkdown>
                    </div>
                  )}

                  {task?.parameters && ['filing_search', 'transcript_search'].includes(task?.skill ?? '') &&
                      <>
                        <div>
                          <h4>
                            {'Task Parameters'}
                          </h4>
                        </div>
                        {Object.keys(task.parameters).map((a: string) => (
                          <div className='relative flex w-full flex-grow flex-col justify-center rounded-xl border border-black/10 bg-white py-3 shadow-[0_0_10px_rgba(0,0,0,0.10)] dark:border-gray-900/50 dark:bg-neutral-800 dark:text-white dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] md:py-4 md:pl-4'>
                            <input
                              className='m-0 w-full resize-none border-0 bg-transparent p-0 pl-2 pr-12 text-black text-sm outline-none focus:ring-0 focus-visible:ring-0 dark:bg-transparent dark:text-white dark:placeholder-neutral-600 md:pl-0' 
                              placeholder={a}
                              value={task.parameters[a]}/>
                          </div>
                        ))}
                      </>
                  }
                  {logs.length > 0 &&
                    (outputMessages.length === 0 ||
                      block.status === 'complete') && (
                      <AgentCollapsible
                        title={logs[0].title ?? '🔎 Search logs'}
                        isOpen={false}
                      >
                        <div className="prose prose-lg text-base w-full dark:prose-invert prose-pre:bg-neutral-200 prose-pre:text-black dark:prose-pre:bg-neutral-800 dark:prose-pre:text-white">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {logs[0].text}
                          </ReactMarkdown>
                        </div>
                      </AgentCollapsible>
                    )}
                </div>
              </div>
            </div>
          </AgentResult>
        )}
      </div>
    </div>
  ) : (
    <AgentLabelBlock block={block} />
  );
};
