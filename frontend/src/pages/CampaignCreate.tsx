import React, { useState } from 'react';
import AntiSpamSettings from '../components/CampaignForm/AntiSpamSettings';

const CampaignCreate: React.FC = () => {
  const [rotateInstances, setRotateInstances] = useState(false);
  const [rotationStrategy, setRotationStrategy] = useState('health-based');

  const [antiSpam, setAntiSpam] = useState({
    sendTyping: true,
    typingTime: 3000,
    messageInterval: {
      min: 2000,
      max: 5000
    },
    pauseAfter: {
      count: 20,
      duration: {
        min: 15000,
        max: 45000
      }
    },
    distributeDelivery: true,
    randomizeContent: true,
    avoidSimilarMessages: true,
    adaptiveThrottling: true
  });

  return (
    <div>
      {/* ... código existente ... */}

      <AntiSpamSettings 
        antiSpamConfig={antiSpam}
        onChange={setAntiSpam}
        rotateInstances={rotateInstances}
        onRotateInstancesChange={setRotateInstances}
        rotationStrategy={rotationStrategy}
        onRotationStrategyChange={setRotationStrategy}
      />

      {/* ... código existente ... */}
    </div>
  );
};

export default CampaignCreate; 