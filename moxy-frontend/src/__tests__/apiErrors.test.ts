// src/__tests__/apiErrors.test.ts
// Server errors become readable toast messages.

import { describe, it, expect, vi } from "vitest";
import type { AxiosError } from "axios";

vi.mock("@/lib/supabase", () => ({ supabase: { auth: {} } }));

import { normalizeError } from "@/api/client";

const axiosError = (status: number, data: unknown) =>
  ({ message: `Request failed with status code ${status}`, response: { status, data } }) as AxiosError;

describe("normalizeError", () => {
  it("uses a plain detail string", () => {
    expect(normalizeError(axiosError(409, { detail: "That username is already taken" })).message)
      .toBe("That username is already taken");
  });

  it("shows the first validation reason instead of the status code", () => {
    const err = axiosError(422, { detail: [{ loc: ["body", "name"], msg: "Value error, Group name can't be empty" }] });
    expect(normalizeError(err)).toMatchObject({ status: 422, message: "Group name can't be empty" });
  });

  it("falls back to the transport message when there's no response body", () => {
    expect(normalizeError({ message: "Network Error" } as AxiosError).message).toBe("Network Error");
  });
});
