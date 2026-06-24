import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

import SubscriptionHistory from "../components/SubscriptionHistory";
import { useContractEvents } from "../hooks/useContractEvents";

// Mock the hook
vi.mock("../hooks/useContractEvents", () => ({
  useContractEvents: vi.fn(),
}));

const mockedUseContractEvents = vi.mocked(useContractEvents);

describe("SubscriptionHistory", () => {
  beforeEach(() => {
    mockedUseContractEvents.mockClear();
  });

  it("renders loading state initially", () => {
    mockedUseContractEvents.mockReturnValue({
      events: [],
      loading: true,
      error: null,
      refresh: vi.fn(),
    });

    render(<SubscriptionHistory userKey="GABC123" />);

    expect(screen.getByLabelText(/loading charge history/i)).toBeInTheDocument();
  });

  it("renders charge events when data is loaded", async () => {
    const mockEvents = [
      {
        eventName: "charged",
        address: "GABC123",
        data: {
          _value: {
            merchant: "GXYZ789",
            amount: "5000000", // 0.5 XLM
            charged_at: String(Math.floor(new Date("2024-01-15T10:00:00Z").getTime() / 1000)),
          },
        },
        ledger: 100,
        timestamp: "2024-01-15T10:00:00Z",
        txHash: "abc123def456",
      },
      {
        eventName: "charged",
        address: "GABC123",
        data: {
          _value: {
            merchant: "GXYZ789",
            amount: "10000000", // 1.0 XLM
            charged_at: String(Math.floor(new Date("2024-01-01T10:00:00Z").getTime() / 1000)),
          },
        },
        ledger: 99,
        timestamp: "2024-01-01T10:00:00Z",
        txHash: "def789abc123",
      },
    ];

    mockedUseContractEvents.mockReturnValue({
      events: mockEvents,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<SubscriptionHistory userKey="GABC123" />);

    await waitFor(() => {
      expect(screen.getByText(/Jan 15, 2024/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/0.50 XLM/i)).toBeInTheDocument();
    expect(screen.getByText(/Jan 1, 2024/i)).toBeInTheDocument();
    expect(screen.getByText(/1.00 XLM/i)).toBeInTheDocument();
  });

  it("renders empty state when no charges exist", async () => {
    mockedUseContractEvents.mockReturnValue({
      events: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<SubscriptionHistory userKey="GABC123" />);

    await waitFor(() => {
      expect(
        screen.getByText(/no charges yet\. your subscription billing history will appear here\./i)
      ).toBeInTheDocument();
    });
  });

  it("renders error state when fetch fails", async () => {
    mockedUseContractEvents.mockReturnValue({
      events: [],
      loading: false,
      error: "Network error",
      refresh: vi.fn(),
    });

    render(<SubscriptionHistory userKey="GABC123" />);

    await waitFor(() => {
      expect(screen.getByText(/unable to load charge history\./i)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("calls useContractEvents with the correct user key", async () => {
    mockedUseContractEvents.mockReturnValue({
      events: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<SubscriptionHistory userKey="GTESTUSER123" />);

    await waitFor(() => {
      expect(mockedUseContractEvents).toHaveBeenCalledWith("charged", "GTESTUSER123");
    });
  });
});
