import { FC, use, useEffect, useState } from 'react';
import { Select } from './Select';
import { SelectItem } from '@/types';
import { AGENT, ITERATIONS, MODELS } from '@/utils/constants';
import { translate } from '../../utils/translate';
import { getUserApiKey } from '@/utils/settings';

interface AgentParameterProps {
  model: SelectItem;
  setModel: (model: SelectItem) => void;
  iterations: SelectItem;
  setIterations: (iterations: SelectItem) => void;
  firstTask: string;
  setFirstTask: (firstTask: string) => void;
  agent: SelectItem;
  setAgent: (agent: SelectItem) => void;
}

export const AgentParameter: FC<AgentParameterProps> = ({
  model,
  setModel,
  iterations,
  setIterations,
  firstTask,
  setFirstTask,
  agent,
  setAgent,
}) => {
  const [agentOption, setAgentOption] = useState<SelectItem[]>(AGENT);
  useEffect(() => {
    let option: SelectItem[] = [];
    if (model.id !== 'gpt-4') {
      option = AGENT.filter(
        (agent) =>
          agent.id === 'babyelfagi'
      );
    } else if (!getUserApiKey()) {
      // bui-mod-1 is only available for using client api key
      option = AGENT.filter((agent) => agent.id !== 'bui-mod-1');
    } else {
      option = AGENT;
    }
    setAgent(option[0]);
    setAgentOption(option);
  }, [model]);

  return (
    <div className="mx-auto flex flex-col items-start space-y-3 p-4 pt-14 lg:w-2/3 xl:w-2/4">
      <div className="z-20 flex w-full items-start justify-center gap-2">
        <Select
          label={translate('MODEL')}
          item={model}
          items={MODELS}
          onChange={(value) => {
            setModel(MODELS.find((model) => model.id === value)!);
          }}
        />
        <Select
          label={translate('AGENT')}
          item={agent}
          items={agentOption}
          onChange={(value) => {
            setAgent(AGENT.find((agent) => agent.id === value)!);
          }}
        />
      </div>
    </div>
  );
};
