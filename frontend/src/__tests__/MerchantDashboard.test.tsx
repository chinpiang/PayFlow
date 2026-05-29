import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("../stellar");
vi.mock("../hooks/usePolling", () => ({ usePolling: () => {} }));

import * as stellar from "../stellar";
import MerchantDashboard from "../components/MerchantDashboard";

const SAMPLE_SUBSCRIBER = {
  subscriber: "GTESTER000000000000000000000000000000000000000000",
  amount: "10000000",
  interval: 2592000,
  lastCharged: 0,
  nextChargeAt: 2592000,
};

describe("MerchantDashboard", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders active subscribers with formatted values and copy buttons", async () => {
    vi.mocked(stellar.getMerchantSubscribers).mockResolvedValue([SAMPLE_SUBSCRIBER]);

    render(<MerchantDashboard merchantKey="GMERCHANT" refreshTrigger={0} />);

    await waitFor(() => expect(screen.getByText(/Merchant Subscribers/)).toBeTruthy());

    expect(screen.getByText("GTESTE…0000")).toBeTruthy();
    expect(screen.getByText("1.0000000 XLM")).toBeTruthy();
    expect(screen.getByText(/Next charge/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy address/i })).toBeTruthy();
  });

  it("shows an empty state when there are no active subscribers", async () => {
    vi.mocked(stellar.getMerchantSubscribers).mockResolvedValue([]);

    render(<MerchantDashboard merchantKey="GMERCHANT" refreshTrigger={0} />);

    await waitFor(() => expect(screen.getByText(/No active subscribers found/)).toBeTruthy());
  });
});
