import { searchFilingsTool } from '@/agents/common/tools/searchFilings';
import { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { query, symbol, quarterList } = await req.body;

    const response = await searchFilingsTool(query, symbol, quarterList);
    return res.status(200).json({ response: response });
  } catch (error) {
    return res.status(500).json({ error: error });
  }
};

export default handler;
