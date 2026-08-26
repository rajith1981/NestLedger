import React from 'react';
import { Sparkles, Upload } from 'lucide-react';

interface DemoBannerProps {
  onOpenUpload: () => void;
}

export const DemoBanner: React.FC<DemoBannerProps> = ({ onOpenUpload }) => {
  return (
    <div className="demo-banner">
      <div className="demo-banner-content">
        <Sparkles size={16} color="#38bdf8" />
        <span>Showing sample statements. Import your own to replace them.</span>
      </div>
      <button className="demo-banner-btn" onClick={onOpenUpload}>
        <Upload size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
        Import Real Statement
      </button>
    </div>
  );
};
