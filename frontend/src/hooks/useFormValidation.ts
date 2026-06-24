import { useState, useCallback, useRef, useEffect } from "react";
import { StrKey } from "@stellar/stellar-sdk";
import { server } from "../stellar";

export interface FormFields {
  merchant: string;
  amount: string;
  interval: number;
}

export interface FormErrors {
  merchant?: string;
  amount?: string;
  interval?: string;
}

interface UseFormValidationResult {
  errors: FormErrors;
  validate: (fields: FormFields) => boolean;
  isValid: boolean;
  validating: boolean;
  validateAsync: (fields: FormFields) => Promise<boolean>;
}

export function useFormValidation(): UseFormValidationResult {
  const [errors, setErrors] = useState<FormErrors>({});
  const [validating, setValidating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const validate = useCallback((fields: FormFields): boolean => {
    const next: FormErrors = {};

    if (!fields.merchant) {
      next.merchant = "Merchant address is required.";
    } else if (!StrKey.isValidEd25519PublicKey(fields.merchant)) {
      next.merchant = "Invalid Stellar address.";
    }

    const amt = parseFloat(fields.amount);
    if (!fields.amount || isNaN(amt) || amt <= 0) {
      next.amount = "Amount must be greater than 0.";
    }

    if (!fields.interval || fields.interval <= 0) {
      next.interval = "Interval must be greater than 0.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }, []);

  const validateAsync = useCallback(async (fields: FormFields): Promise<boolean> => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const syncPassed = validate(fields);
    if (!syncPassed) {
      return false;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setValidating(true);
    try {
      await server.getAccount(fields.merchant);

      if (controller.signal.aborted) {
        return false;
      }

      setErrors(prev => {
        if (prev.merchant === "Account not found on network.") {
          const { merchant: _, ...rest } = prev;
          return rest;
        }
        return prev;
      });

      return true;
    } catch (err) {
      if (controller.signal.aborted) {
        return false;
      }

      setErrors(prev => ({
        ...prev,
        merchant: "Account not found on network.",
      }));

      return false;
    } finally {
      if (!controller.signal.aborted) {
        setValidating(false);
      }
    }
  }, [validate]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    errors,
    validate,
    isValid: Object.keys(errors).length === 0,
    validating,
    validateAsync,
  };
}

