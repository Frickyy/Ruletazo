import { describe, expect, it } from "vitest";
import { familyIdMatches } from "../pages/ProfilePage.jsx";

const profile = { steam_id: "76561197960287930", vanity: "gaben" };

describe("familyIdMatches", () => {
  it("reconoce el SteamID64, la vanity y los links de perfil", () => {
    expect(familyIdMatches("76561197960287930", profile)).toBe(true);
    expect(familyIdMatches("GabeN", profile)).toBe(true);
    expect(familyIdMatches("https://steamcommunity.com/id/gaben/", profile)).toBe(true);
    expect(familyIdMatches("https://steamcommunity.com/profiles/76561197960287930", profile)).toBe(true);
  });

  it("no confunde a otra persona ni campos vacíos", () => {
    expect(familyIdMatches("robin", profile)).toBe(false);
    expect(familyIdMatches("", profile)).toBe(false);
    expect(familyIdMatches("gaben", { steam_id: "76561197960287930", vanity: "" })).toBe(false);
  });
});
