import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveContactPhone, resolveContactPhoto } from "./contact-info";
import { fromChatId } from "./phone";

test("a LID is never parsed as a phone, including phone-sized LIDs", () => {
  for (const id of ["5511999999999@lid", "123456789012345@lid", "12345678901@g.us", "status@broadcast"]) {
    assert.equal(fromChatId(id), "");
  }
  assert.equal(fromChatId("14155552671@c.us"), "14155552671");
});

test("only an explicit mapping for this LID can supply its real phone", async () => {
  const client = {
    getContactLidAndPhone: async () => [{ lid: "12345678901@lid", pn: "14155552671@c.us" }],
    getProfilePicUrl: async () => undefined,
  };
  assert.equal(await resolveContactPhone(client, "12345678901@lid"), "14155552671");
  assert.equal(await resolveContactPhone(client, "99999999999@lid"), null);
  assert.equal(
    await resolveContactPhone(
      {
        ...client,
        getContactLidAndPhone: async () => {
          throw new Error("cache");
        },
      },
      "12345678901@lid",
    ),
    null,
  );
});

test("photo lookup tries the real number when the LID lookup fails", async () => {
  const calls: string[] = [];
  const client = {
    getContactLidAndPhone: async () => [],
    getProfilePicUrl: async (id: string) => {
      calls.push(id);
      if (id.endsWith("@lid")) throw new Error("unavailable");
      return "https://example.com/photo.jpg";
    },
  };
  assert.equal(await resolveContactPhoto(client, "12345678901@lid", "14155552671"), "https://example.com/photo.jpg");
  assert.deepEqual(calls, ["12345678901@lid", "14155552671@c.us"]);
});

test("no accessible photo is a normal result", async () => {
  assert.equal(
    await resolveContactPhoto(
      { getContactLidAndPhone: async () => [], getProfilePicUrl: async () => undefined },
      "12345678901@lid",
      null,
    ),
    undefined,
  );
});
