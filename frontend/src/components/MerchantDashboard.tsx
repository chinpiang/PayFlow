import React, { useCallback, useEffect, useState } from "react";
import { getMerchantSubscribers, type MerchantSubscriber } from "../stellar";
import { formatAddress, formatXlm } from "../utils/format";
import { usePolling } from "../hooks/usePolling";
import CopyButton from "./CopyButton";

interface Props {
  merchantKey: string;
  refreshTrigger: number;
}

function formatNextCharge(nextChargeAt: number): string {
  const date = new Date(nextChargeAt * 1000);
  return date.toLocaleString();
}

export default function MerchantDashboard({
  merchantKey,
  refreshTrigger,
}: Props) {
  const [subscribers, setSubscribers] = useState<MerchantSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setSubscribers((prev) => {
      if (prev.length === 0) setLoading(true);
      return prev;
    });
    setError(null);

    try {
      const data = await getMerchantSubscribers(merchantKey);
      setSubscribers(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [merchantKey]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshTrigger]);

  usePolling({ callback: refresh, interval: 30000, enabled: true });

  if (loading) {
    return (
      <div className="dashboard">
        <p className="text-muted">Loading merchant subscribers…</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="flex-between mb-4">
        <div>
          <h2 className="text-xl font-bold">Merchant Subscribers</h2>
          <p className="text-sm text-muted">
            Active subscribers paying your merchant wallet.
          </p>
        </div>
        <button className="btn-secondary" onClick={refresh}>
          Refresh
        </button>
      </div>

      {error && (
        <p className="action-status" style={{ color: "var(--color-danger)" }}>
          Error: {error}
        </p>
      )}

      {subscribers.length === 0 ? (
        <div className="card">
          <p className="no-sub-text">
            No active subscribers found for {formatAddress(merchantKey)}.
          </p>
        </div>
      ) : (
        <div className="card merchant-subscriber-card">
          <div className="merchant-subscriber-meta mb-4">
            <span className="text-sm text-muted">
              {subscribers.length} active subscriber{subscribers.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="subscription-rows merchant-subscriber-list">
            {subscribers.map((entry) => (
              <div className="subscription-row merchant-subscriber-row" key={entry.subscriber}>
                <div className="merchant-row">
                  <span className="merchant-row__address">
                    {formatAddress(entry.subscriber)}
                  </span>
                  <CopyButton text={entry.subscriber} />
                </div>
                <div className="merchant-subscriber-value">
                  <span className="subscription-row__value">
                    {formatXlm(entry.amount)}
                  </span>
                  <span className="subscription-row__label">
                    Next charge {formatNextCharge(entry.nextChargeAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
