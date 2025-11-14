import React, { useState } from 'react';
import StoryContinuityTracker from '../../services/ai/StoryContinuityTracker';
import BatchProcessor from '../../services/ai/BatchProcessor';

export default function ContinuityPanel({ project, onProjectUpdate }) {
  const [checkFirst, setCheckFirst] = useState(true);
  const [autoFix, setAutoFix] = useState(true);

  const checkFullStory = async () => {
    const issues = await StoryContinuityTracker.checkContinuityBeforeWriting(1, project.story.content);
    // ... logic
  };

  const startBatchProcess = async () => {
    const result = await BatchProcessor.processFullNovel({ operation: 'continuityCheck' });
    // ... update project
  };

  return (
    <div className="continuity-panel">
      <label>
        <input type="checkbox" checked={checkFirst} onChange={(e) => setCheckFirst(e.target.checked)} />
        Tarkista ensin
      </label>
      <button onClick={checkFullStory}>Tarkista koko tarina</button>
      <button onClick={startBatchProcess}>Batch-prosessoi</button>
    </div>
  );
}

















