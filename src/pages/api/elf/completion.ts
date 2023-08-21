import { ChatOpenAI } from 'langchain/chat_models/openai';
import { HumanChatMessage } from 'langchain/schema';
import { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const {
      chatMessages,
      model_name,
      temperature,
      max_tokens,
      top_p,
      frequency_penalty,
      presence_penalty,
    } = await req.body;
    const llm = new ChatOpenAI({
      modelName: model_name,
      temperature,
      maxTokens: max_tokens,
      topP: top_p || 1,
      frequencyPenalty: frequency_penalty || 0,
      presencePenalty: presence_penalty || 0,
      verbose: true,
    });

    const response = await llm.call(JSON.parse(chatMessages));

    return res.status(200).json({ response: response.text });
  } catch (error) {
    return res.status(500).json({ error: error });
  }
};

export default handler;
