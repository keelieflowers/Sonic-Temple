import request from "supertest";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApp } from "../src/app.js";
import { ArtistMbidStore } from "../src/services/artistMbidStore.js";
import { FinalSetlistCacheStore } from "../src/services/finalSetlistCacheStore.js";
import {
  buildArtistShowResults,
  getArtistShowsWithCache,
  refreshArtistMbidCache
} from "../src/services/festivalService.js";
import { Logger } from "../src/services/logger.js";
import { ScheduleSource } from "../src/services/scheduleSource.js";
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

function makeFinalCacheStoreMock(overrides?: Partial<FinalSetlistCacheStore>) {
  return {
    get: async () => null,
    set: async (_bandNames, results) => ({
      generatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      results
    }),
    isExpired: () => false,
    ...overrides
  } as FinalSetlistCacheStore;
}

function makeScheduleSourceMock(overrides?: Partial<ScheduleSource>) {
  return {
    getBandNames: async () => [],
    ...overrides
  } as ScheduleSource;
}

function makeLogger() {
  return new Logger("warn", "test");
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

  it("prefers festival venue ids over pure recency", async () => {
    const client = makeClientMock({
      searchArtistsByName: async () => [{ mbid: "artist-id", name: "Band" }],
      searchSetlistsByArtistMbid: async () => [
        {
          id: "newest-non-festival",
          eventDate: "20-04-2026",
          venue: { id: "non-festival" },
          sets: { set: [{ song: [{ name: "Song A" }] }] }
        },
        {
          id: "festival-priority",
          eventDate: "18-04-2026",
          venue: { id: "festival-stage-id" },
          sets: { set: [{ song: [{ name: "Song B" }] }] }
        }
      ]
    });

    const result = await buildArtistShowResults(["Band"], client, undefined, {
      festivalVenueIds: ["festival-stage-id"]
    });

    assert.equal(result[0].latestSetlist?.id, "festival-priority");
    assert.equal(result[0].selectionMode, "festivalVenuePriority");
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

  it("serves cached result when TTL is still valid", async () => {
    const cacheEntry = {
      generatedAt: "2026-04-30T11:00:00.000Z",
      expiresAt: "2026-05-01T11:00:00.000Z",
      results: [
        {
          inputBandName: "Band",
          artistMatch: { mbid: "mbid", name: "Band" },
          latestSetlist: null,
          status: "no_setlist_found" as const
        }
      ]
    };

    const payload = await getArtistShowsWithCache({
      bandNames: ["Band"],
      client: makeClientMock(),
      mbidStore: makeStoreMock(),
      finalCacheStore: makeFinalCacheStoreMock({
        get: async () => cacheEntry,
        isExpired: () => false
      }),
      festivalVenueIds: [],
      cacheTtlHours: 24,
      logger: makeLogger()
    });

    assert.equal(payload.cache.hit, true);
    assert.equal(payload.results[0].inputBandName, "Band");
  });

  it("does not overwrite existing MBID entries during refresh", async () => {
    let setCalls = 0;
    const summary = await refreshArtistMbidCache(
      ["My Chemical Romance"],
      makeClientMock({
        searchArtistsByName: async () => [{ mbid: "new-mbid", name: "My Chemical Romance" }]
      }),
      makeStoreMock({
        get: async () => ({
          inputBandName: "My Chemical Romance",
          mbid: "existing-mbid",
          matchedArtistName: "My Chemical Romance",
          updatedAt: new Date().toISOString()
        }),
        set: async () => {
          setCalls += 1;
        }
      }),
      makeLogger()
    );

    assert.equal(summary.alreadyCached, 1);
    assert.equal(setCalls, 0);
  });

  it("skips ambiguous MBID and returns needsReview", async () => {
    const summary = await refreshArtistMbidCache(
      ["Lit"],
      makeClientMock({
        searchArtistsByName: async () => [
          { mbid: "candidate1", name: "Bo Lit" },
          { mbid: "candidate2", name: "Lit Up" }
        ]
      }),
      makeStoreMock(),
      makeLogger()
    );

    assert.equal(summary.skippedAmbiguous, 1);
    assert.equal(summary.needsReview[0], "Lit");
  });
});

describe("festival route", () => {
  it("returns 400 for invalid request payload", async () => {
    const app = createApp(
      makeClientMock(),
      makeStoreMock(),
      makeFinalCacheStoreMock(),
      makeScheduleSourceMock(),
      [],
      24,
      makeLogger()
    );
    const response = await request(app).post("/api/festival/artist-shows").send({});

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Invalid request body");
  });

  it("returns no_artist_match when no artist is found", async () => {
    const app = createApp(
      makeClientMock(),
      makeStoreMock(),
      makeFinalCacheStoreMock(),
      makeScheduleSourceMock(),
      [],
      24,
      makeLogger()
    );
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
      makeStoreMock(),
      makeFinalCacheStoreMock(),
      makeScheduleSourceMock(),
      [],
      24,
      makeLogger()
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
      makeStoreMock(),
      makeFinalCacheStoreMock(),
      makeScheduleSourceMock(),
      [],
      24,
      makeLogger()
    );

    const response = await request(app)
      .post("/api/festival/artist-shows")
      .send({ bandNames: ["Any"] });

    assert.equal(response.status, 200);
    assert.equal(response.body.results[0].status, "api_error");
    assert.match(response.body.results[0].error, /Upstream 500/);
  });

  it("refreshes schedule-driven MBIDs and setlist cache", async () => {
    const cache = new Map<string, { mbid: string; matchedArtistName: string; inputBandName: string; updatedAt: string }>();
    const writes: Array<{ inputBandName: string; mbid: string; matchedArtistName: string }> = [];
    const app = createApp(
      makeClientMock({
        searchArtistsByName: async () => [{ mbid: "mcr", name: "My Chemical Romance" }]
      }),
      makeStoreMock({
        get: async (inputBandName: string) => cache.get(inputBandName.toLowerCase()) ?? null,
        set: async (inputBandName, mbid, matchedArtistName) => {
          cache.set(inputBandName.toLowerCase(), {
            inputBandName,
            mbid,
            matchedArtistName,
            updatedAt: new Date().toISOString()
          });
          writes.push({ inputBandName, mbid, matchedArtistName });
        }
      }),
      makeFinalCacheStoreMock(),
      makeScheduleSourceMock({
        getBandNames: async () => ["My Chemical Romance"]
      }),
      [],
      24,
      makeLogger()
    );

    const response = await request(app).post("/api/festival/artist-mbids/refresh").send({});

    assert.equal(response.status, 200);
    assert.equal(response.body.mbidRefresh.added, 1);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].mbid, "mcr");
  });
});
