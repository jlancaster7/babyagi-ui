import { getUserApiKey } from '@/utils/settings';
import { OpenAIChat } from 'langchain/llms/openai';
import { relevantInfoExtractionPrompt } from './prompt';
import { LLMChain } from 'langchain/chains';
import axios from 'axios';
import { HumanChatMessage } from 'langchain/schema';
import { ChatOpenAI } from 'langchain/chat_models/openai';

// TODO: Only client-side requests are allowed.
// To use the environment variable API key, the request must be implemented from the server side.

export const relevantInfoExtractionAgent = async (
  objective: string,
  task: string,
  notes: string,
  chunk: string,
  signal?: AbortSignal,
) => {
  const openAIApiKey = getUserApiKey();
  const modelName = 'gpt-3.5-turbo-16k-0613'; // use a fixed model

  if (!openAIApiKey && process.env.NEXT_PUBLIC_USE_USER_API_KEY === 'true') {
    throw new Error('User API key is not set.');
  }

  if (!openAIApiKey) {
    // server side request
    const response = await axios
      .post(
        '/api/deer/extract',
        {
          objective,
          task,
          notes,
          chunk,
          model_name: modelName,
        },
        {
          signal: signal,
        },
      )
      .catch((error) => {
        if (error.name === 'AbortError') {
          console.log('Request aborted', error.message);
        } else {
          console.log(error.message);
        }
      });
    return response?.data?.response;
  }

  const prompt = `You are an AI assistant that helps people extract information out of documents.
  Your current task is ${task}. 
  Analyze the following text and return information directly related to your current task. 
  Only return information directly related to your current task.
  ${notes.length ? `The following is information that we've gathered thus far: ${notes}` : ''}
  Text to analyze: ${chunk} 
  New Information:
  `
  
  const llm = new ChatOpenAI(
    {
      openAIApiKey,
      modelName,
      temperature: 0,
      maxTokens: 800,
      topP: 1,
      maxRetries: 3
    },
    { baseOptions: { signal: signal } },
  );

  //const chain = new LLMChain({ llm: llm, prompt });
  try {
    const response = await llm.call([new HumanChatMessage(prompt)])
    return response.text;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return null;
    }
    console.log('error: ', error);
    return 'Failed to extract relevant information.';
  }
};
