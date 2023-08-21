import fs from 'fs';
import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.NODE_ENV !== 'development') {
    res.status(403).json({ error: 'Access is forbidden in this environment' });
    return;
  }

  if (req.method === 'GET') {
    const objective = req.query.objective;
    if (!objective) {
      res.status(400).json({ error: 'objective is required' });
      return;
    }
    try {
        const files = fs.readdirSync(path.join(process.cwd(), 'data/example_tasks/'))
        for (let file of files) {
            const data = fs.readFileSync('data/example_tasks/' + file, 'utf8')
            const parsedData = JSON.parse(data)
            if (parsedData.objective === objective) return res.status(200).json({ content: data })
        }
        return res.status(200).json({ content: '' })
    } catch(err) {
        return res.status(500).json({ error: err });
    }
  } else {
    res.status(405).json({ error: 'Only GET method is allowed' });
  }
}
