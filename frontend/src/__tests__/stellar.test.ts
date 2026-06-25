import { describe, it, expect, vi, beforeEach } from "vitest";
import { nativeToScVal, xdr, Address } from "@stellar/stellar-sdk";
import { ScValDecoder, ScValDecodeError } from "../services/scval";

// 1. Intercept the Stellar SDK's Server class safely with a standalone mock implementation
vi.mock("@stellar/stellar-sdk/rpc", () => {
  return {
    Server: class {
      getEvents = vi.fn();
    },
    assembleTransaction: vi.fn(),
  };
});

// Import the implementation AFTER the mock block is securely established
import { fetchEvents, getChargeHistory, server } from "../stellar";

const getEventsMock = server.getEvents as ReturnType<typeof vi.fn>;

// 2. Define the dummy array we want our fake server pipeline to process
const mockRawEvents = [
  {
    topic: ["subscribed", "user_A"],
    value: { amount: 1000 },
    ledger: 123,
    ledgerCloseTime: 1700000000,
    txHash: "txhash1",
  },
  {
    topic: ["subscribed", "user_B"],
    value: { amount: 2000 },
    ledger: 124,
    ledgerCloseTime: 1700000001,
    txHash: "txhash2",
  },
  {
    topic: ["charged", "user_A"],
    value: { amount: 3000 },
    ledger: 125,
    ledgerCloseTime: 1700000002,
    txHash: "txhash3",
  },
  {
    topic: [],
    value: { unknown: true },
    ledger: 126,
    ledgerCloseTime: 1700000003,
    txHash: "txhash4",
  },
];

describe("fetchEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset our mock to return the test suite payload by default
    getEventsMock.mockResolvedValue({ events: mockRawEvents });
  });

  it("filters by event name correctly", async () => {
    const result = await fetchEvents("subscribed");

    expect(result).toHaveLength(2);
    expect(result[0].eventName).toBe("subscribed");
    expect(result[0].address).toBe("user_A");
    expect(result[1].address).toBe("user_B");
  });

  it("filters by address when provided", async () => {
    const result = await fetchEvents("subscribed", "user_A");

    expect(result).toHaveLength(1);
    expect(result[0].eventName).toBe("subscribed");
    expect(result[0].address).toBe("user_A");
    expect(result[0].data).toEqual({ amount: 1000 });
  });

  it("returns empty array on error", async () => {
    // Override default resolution to force an architecture crash
    getEventsMock.mockRejectedValue(new Error("Stellar RPC Network Failure"));

    const result = await fetchEvents("subscribed");

    // The function's internal catch block should swallow the exception and output [] safely
    expect(result).toEqual([]);
  });
});

describe("getMerchantSubscribers", () => {
  it("returns active subscribers for the merchant and ignores cancelled subscriptions", async () => {
    getEventsMock.mockResolvedValue({
      events: [
        {
          topic: ["subscribed", "user_A"],
          value: { merchant: "merchant_A", amount: 1000, interval: 3600 },
          ledgerCloseTime: 1700000000,
          txHash: "txhash1",
        },
        {
          topic: ["charged", "user_A"],
          value: { merchant: "merchant_A", amount: 1000, charged_at: 1700000000 },
          ledgerCloseTime: 1700003600,
          txHash: "txhash2",
        },
        {
          topic: ["subscribed", "user_B"],
          value: { merchant: "merchant_B", amount: 2000, interval: 86400 },
          ledgerCloseTime: 1700000001,
          txHash: "txhash3",
        },
        {
          topic: ["subscribed", "user_C"],
          value: { merchant: "merchant_A", amount: 1500, interval: 7200 },
          ledgerCloseTime: 1700001000,
          txHash: "txhash4",
        },
        {
          topic: ["cancelled", "user_C"],
          value: {},
          ledgerCloseTime: 1700002000,
          txHash: "txhash5",
        },
      ],
    });

    const { getMerchantSubscribers } = await import("../stellar");
    const result = await getMerchantSubscribers("merchant_A");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      subscriber: "user_A",
      amount: "1000",
      interval: 3600,
    });
    expect(result[0].nextChargeAt).toBe(1700007200);
  });

  it("returns an empty array if the event fetch fails", async () => {
    getEventsMock.mockRejectedValue(new Error("Stellar RPC Network Failure"));

    const { getMerchantSubscribers } = await import("../stellar");
    const result = await getMerchantSubscribers("merchant_A");

    expect(result).toEqual([]);
  });
});

describe("getChargeHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns correctly parsed ChargeEvent array", async () => {
    getEventsMock.mockResolvedValue({
      events: [
        {
          topic: ["charged", "user_A"],
          value: {
            _value: {
              merchant: "merchant_A",
              amount: 4500,
              charged_at: 1700000000,
            },
          },
          ledger: 200,
          ledgerCloseTime: 1700000000,
          txHash: "txhash_charged_1",
        },
        {
          topic: ["charged", "user_B"],
          value: {
            _value: {
              merchant: "merchant_B",
              amount: 1200,
              charged_at: 1700000001,
            },
          },
          ledger: 201,
          ledgerCloseTime: 1700000001,
          txHash: "txhash_charged_2",
        },
      ],
    });

    const result = await getChargeHistory("user_A");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      date: new Date(1700000000 * 1000),
      amount: "4500",
      txHash: "txhash_charged_1",
      merchant: "merchant_A",
    });
  });

  it("sorts newest first", async () => {
    getEventsMock.mockResolvedValue({
      events: [
        {
          topic: ["charged", "user_A"],
          value: {
            _value: {
              merchant: "merchant_A",
              amount: 2500,
              charged_at: 1700000000,
            },
          },
          ledger: 300,
          ledgerCloseTime: 1700000000,
          txHash: "txhash_charged_older",
        },
        {
          topic: ["charged", "user_A"],
          value: {
            _value: {
              merchant: "merchant_A",
              amount: 2600,
              charged_at: 1700000100,
            },
          },
          ledger: 301,
          ledgerCloseTime: 1700000100,
          txHash: "txhash_charged_newer",
        },
      ],
    });

    const result = await getChargeHistory("user_A");

    expect(result).toHaveLength(2);
    expect(result[0].txHash).toBe("txhash_charged_newer");
    expect(result[1].txHash).toBe("txhash_charged_older");
  });

  it("returns empty array on error", async () => {
    getEventsMock.mockRejectedValue(new Error("Stellar RPC failure"));

    const result = await getChargeHistory("user_A");

    expect(result).toEqual([]);
  });
});

describe("ScValDecoder", () => {
  describe("decodeI128", () => {
    it("decodes valid i128 correctly", () => {
      const val = nativeToScVal(12345n, { type: "i128" });
      expect(ScValDecoder.decodeI128(val)).toBe(12345n);
    });

    it("throws ScValDecodeError for wrong type", () => {
      const val = nativeToScVal("test", { type: "string" });
      expect(() => ScValDecoder.decodeI128(val)).toThrow(ScValDecodeError);
    });
  });

  describe("decodeU64", () => {
    it("decodes valid u64 correctly", () => {
      const val = nativeToScVal(67890n, { type: "u64" });
      expect(ScValDecoder.decodeU64(val)).toBe(67890n);
    });

    it("throws ScValDecodeError for wrong type", () => {
      const val = nativeToScVal("test", { type: "string" });
      expect(() => ScValDecoder.decodeU64(val)).toThrow(ScValDecodeError);
    });
  });

  describe("decodeBool", () => {
    it("decodes true correctly", () => {
      const val = nativeToScVal(true, { type: "bool" });
      expect(ScValDecoder.decodeBool(val)).toBe(true);
    });

    it("decodes false correctly", () => {
      const val = nativeToScVal(false, { type: "bool" });
      expect(ScValDecoder.decodeBool(val)).toBe(false);
    });

    it("throws ScValDecodeError for wrong type", () => {
      const val = nativeToScVal("test", { type: "string" });
      expect(() => ScValDecoder.decodeBool(val)).toThrow(ScValDecodeError);
    });
  });

  describe("decodeAddress", () => {
    it("decodes valid address correctly", () => {
      const address = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
      const val = nativeToScVal(Address.fromString(address), { type: "address" });
      expect(ScValDecoder.decodeAddress(val)).toBe(address);
    });

    it("throws ScValDecodeError for wrong type", () => {
      const val = nativeToScVal("test", { type: "string" });
      expect(() => ScValDecoder.decodeAddress(val)).toThrow(ScValDecodeError);
    });
  });

  describe("decodeString", () => {
    it("decodes valid string correctly", () => {
      const val = nativeToScVal("hello world", { type: "string" });
      expect(ScValDecoder.decodeString(val)).toBe("hello world");
    });

    it("throws ScValDecodeError for wrong type", () => {
      const val = nativeToScVal(123n, { type: "i128" });
      expect(() => ScValDecoder.decodeString(val)).toThrow(ScValDecodeError);
    });
  });

  describe("decodeSymbol", () => {
    it("decodes valid symbol correctly", () => {
      const val = nativeToScVal("SYMBOL", { type: "symbol" });
      expect(ScValDecoder.decodeSymbol(val)).toBe("SYMBOL");
    });

    it("throws ScValDecodeError for wrong type", () => {
      const val = nativeToScVal("test", { type: "string" });
      expect(() => ScValDecoder.decodeSymbol(val)).toThrow(ScValDecodeError);
    });
  });

  describe("decodeOption", () => {
    it("returns null for scvVoid", () => {
      const val = nativeToScVal(undefined, { type: "void" });
      expect(ScValDecoder.decodeOption(val, ScValDecoder.decodeString)).toBeNull();
    });

    it("decodes non-void option correctly", () => {
      const val = nativeToScVal("test", { type: "string" });
      expect(ScValDecoder.decodeOption(val, ScValDecoder.decodeString)).toBe("test");
    });
  });

  describe("decodeVec", () => {
    it("decodes valid vector correctly", () => {
      const val = nativeToScVal([1n, 2n, 3n], { type: "i128" });
      const result = ScValDecoder.decodeVec(val, ScValDecoder.decodeI128);
      expect(result).toEqual([1n, 2n, 3n]);
    });

    it("throws ScValDecodeError for wrong type", () => {
      const val = nativeToScVal("test", { type: "string" });
      expect(() => ScValDecoder.decodeVec(val, ScValDecoder.decodeI128)).toThrow(ScValDecodeError);
    });
  });

  describe("decodeStruct", () => {
    it("decodes valid struct with correct schema", () => {
      const val = nativeToScVal({
        name: nativeToScVal("Alice", { type: "string" }),
        age: nativeToScVal(30n, { type: "u64" }),
      });
      const result = ScValDecoder.decodeStruct(val, {
        name: ScValDecoder.decodeString,
        age: (v) => Number(ScValDecoder.decodeU64(v)),
      });
      expect(result).toEqual({ name: "Alice", age: 30 });
    });

    it("throws ScValDecodeError for non-map type", () => {
      const val = nativeToScVal("test", { type: "string" });
      expect(() => ScValDecoder.decodeStruct(val, {})).toThrow(ScValDecodeError);
    });
  });
});