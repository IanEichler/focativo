import { describe, expect, it } from "vitest";
import { extractSearchQuery } from "./search-query";

describe("extractSearchQuery", () => {
  it("strips greetings and filler words, keeping the product term", () => {
    expect(extractSearchQuery("Oi, vocês têm creatina?")).toBe("creatina");
  });

  it("keeps multi-word product names", () => {
    expect(extractSearchQuery("Queria saber o preço do whey de chocolate")).toBe("saber preço whey chocolate");
  });

  it("falls back to the original text when every word is a stopword", () => {
    expect(extractSearchQuery("Oi, você tem?")).toBe("Oi, você tem?");
  });
});
