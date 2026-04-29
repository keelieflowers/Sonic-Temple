import request from "supertest";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApp } from "../src/app.js";
import { ArtistMbidStore } from "../src/services/artistMbidStore.js";
import { buildArtistShowResults } from "../src/services/festivalService.js";
import { SetlistClient } from "../src/services/setlistClient.js";

function makeClientMock(overrides?: Partial<SetlistClient>) {
  return {
    searchArtistsByName: async () => [],
    searchSetlistsByArtistMbid: async () => [],
    ...overrides
  } as SetlistClient;
}

function makeStoreMock(overrides?: Partial<ArtistMbidStore>) {
  return {
    get: async () => null,
    set: async () => undefined,
    clear: async () => undefined,
    ...overrides
  } as ArtistMbidStore;
}

describe("festivalService", () => {
  it("normalizes artist and latest setlist payload", async () => {
    const client = makeClientMock({
      searchArtistsByName: async () => [{ mbid: "mbid-1", name: "Bad Omens" }],
      searchSetlistsByArtistMbid: async () => [
        {
          id: "setlist-1",
          eventDate: "20-04-2026",
          tour: { name: "Concrete Jungle Tour" },
          venue: { name: "The Hall", city: { name: "Boston", country: { code: "US" } } },
          sets: {
            set: [{ name: "Main", song: [{ name: "Artificial Suicide" }, { name: "Dethrone" }] }]
          }
        }
      ]
    });

    const result = await buildArtistShowResults(["Bad Omens"], client);
    assert.equal(result[0].status, "ok");
    assert.equal(result[0].artistMatch?.name, "Bad Omens");
    assert.equal(result[0].latestSetlist?.songCount, 2);
    assert.deepEqual(result[0].latestSetlist?.sections[0]?.songs, [
      "Artificial Suicide",
      "Dethrone"
    ]);
  });

  it("chooses best artist by name closeness over first result", async () => {
    const client = makeClientMock({
      searchArtistsByName: async () => [
        {
          mbid: "wrong",
          name: "The Hirs Collective feat. Frank Iero, My Chemical Romance & Rosie Richeson"
        },
        { mbid: "right", name: "My Chemical Romance" }
      ],
      searchSetlistsByArtistMbid: async (artistMbid: string) => [
        {
          id: `setlist-${artistMbid}`,
          eventDate: "20-04-2026",
          sets: { set: [{ song: [{ name: "Helena" }] }] }
        }
      ]
    });

    const result = await buildArtistShowResults(["My Chemical Romance"], client);
    assert.equal(result[0].artistMatch?.mbid, "right");
  });

  it("uses latest completed setlist with songs and skips future empty setlists", async () => {
    const client = makeClientMock({
      searchArtistsByName: async () => [{ mbid: "bmth", name: "Bring Me the Horizon" }],
      searchSetlistsByArtistMbid: async () => [
        { id: "future-1", eventDate: "31-12-2099", sets: { set: [] } },
        { id: "future-2", eventDate: "30-12-2099", sets: { set: [] } },
        {
          id: "recent-valid",
          eventDate: "20-04-2026",
          sets: { set: [{ name: "Set 1", song: [{ name: "Can You Feel My Heart" }] }] }
        },
        {
          id: "older-valid",
          eventDate: "10-04-2026",
          sets: { set: [{ name: "Set 1", song: [{ name: "Drown" }] }] }
        }
      ]
    });

    const result = await buildArtistShowResults(["Bring Me the Horizon"], client);
    assert.equal(result[0].status, "ok");
    assert.equal(result[0].latestSetlist?.id, "recent-valid");
  });

  it("uses cached MBID and skips artist lookup", async () => {
    let searchArtistsCalled = 0;
    const client = makeClientMock({
      searchArtistsByName: async () => {
        searchArtistsCalled += 1;
        return [];
      },
      searchSetlistsByArtistMbid: async () => [
        {
          id: "cached-setlist",
          eventDate: "20-04-2026",
          sets: { set: [{ song: [{ name: "Cached Song" }] }] }
        }
      ]
    });

    const store = makeStoreMock({
      get: async () => ({
        inputBandName: "My Chemical Romance",
        mbid: "cached-mbid",
        matchedArtistName: "My Chemical Romance",
        updatedAt: new Date().toISOString()
      })
    });

    const result = await buildArtistShowResults(["My Chemical Romance"], client, store);
    assert.equal(result[0].status, "ok");
    assert.equal(result[0].artistMatch?.mbid, "cached-mbid");
    assert.equal(searchArtistsCalled, 0);
  });
});

describe("festival route", () => {
  it("returns 400 for invalid request payload", async () => {
    const app = createApp(makeClientMock(), makeStoreMock());
    const response = await request(app).post("/api/festival/artist-shows").send({});

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Invalid request body");
  });

  it("returns no_artist_match when no artist is found", async () => {
    const app = createApp(makeClientMock(), makeStoreMock());
    const response = await request(app)
      .post("/api/festival/artist-shows")
      .send({ bandNames: ["Unknown Band"] });

    assert.equal(response.status, 200);
    assert.equal(response.body.results[0].status, "no_artist_match");
  });

  it("returns no_setlist_found when artist has no setlists", async () => {
    const app = createApp(
      makeClientMock({
        searchArtistsByName: async () => [{ mbid: "mbid-2", name: "Artist" }]
      }),
      makeStoreMock()
    );

    const response = await request(app)
      .post("/api/festival/artist-shows")
      .send({ bandNames: ["Artist"] });

    assert.equal(response.status, 200);
    assert.equal(response.body.results[0].status, "no_setlist_found");
  });

  it("returns api_error when upstream call fails", async () => {
    const app = createApp(
      makeClientMock({
        searchArtistsByName: async () => {
          throw new Error("Upstream 500");
        }
      }),
      makeStoreMock()
    );

    const response = await request(app)
      .post("/api/festival/artist-shows")
      .send({ bandNames: ["Any"] });

    assert.equal(response.status, 200);
    assert.equal(response.body.results[0].status, "api_error");
    assert.match(response.body.results[0].error, /Upstream 500/);
  });

  it("refreshes and stores artist mbids", async () => {
    const writes: Array<{ inputBandName: string; mbid: string; matchedArtistName: string }> = [];
    const app = createApp(
      makeClientMock({
        searchArtistsByName: async () => [{ mbid: "mcr", name: "My Chemical Romance" }]
      }),
      makeStoreMock({
        set: async (inputBandName, mbid, matchedArtistName) => {
          writes.push({ inputBandName, mbid, matchedArtistName });
        }
      })
    );

    const response = await request(app)
      .post("/api/festival/artist-mbids/refresh")
      .send({ bandNames: ["My Chemical Romance"] });

    assert.equal(response.status, 200);
    assert.equal(response.body.stored, 1);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].mbid, "mcr");
  });

  it("clears existing store when refresh mode is used", async () => {
    let clearCalled = 0;
    const app = createApp(
      makeClientMock({
        searchArtistsByName: async () => [{ mbid: "mcr", name: "My Chemical Romance" }]
      }),
      makeStoreMock({
        clear: async () => {
          clearCalled += 1;
        }
      })
    );

    const response = await request(app)
      .post("/api/festival/artist-mbids/refresh")
      .send({ bandNames: ["My Chemical Romance"], mode: "refresh" });

    assert.equal(response.status, 200);
    assert.equal(clearCalled, 1);
  });
});
