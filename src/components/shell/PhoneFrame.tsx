'use client';

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  const now = new Date();
  const time = now.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false });
  return (
    <div className="phone-frame-outer">
      <div className="phone-frame-device">
        <div className="phone-btn-vol-up" />
        <div className="phone-btn-vol-down" />
        <div className="phone-btn-power" />
        <div className="phone-screen">
          <div className="phone-notch" />
          <div className="phone-status-bar">
            <div className="status-bar-inner">
              <span>{time}</span>
              <div className="status-right">
                <span>●●●●</span><span>4G</span><span>78%</span>
              </div>
            </div>
          </div>
          <div className="phone-content">{children}</div>
          <div className="phone-home-indicator" />
        </div>
      </div>
    </div>
  );
}
