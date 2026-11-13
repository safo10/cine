const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");

let testEnv;
const PROJECT_ID = process.env.GCP_PROJECT || "demo-no-project";
const ALICE_UID = "alice_cine_123";
const BOB_UID = "bob_cine_456";

const [emulatorHost, emulatorPortStr] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085").split(":");
const emulatorPort = parseInt(emulatorPortStr, 10);

function validMediaPayload(uid, overrides = {}) {
  return {
    userId: uid,
    title: "Dark",
    originalTitle: "Dark",
    overview: "Mystery across time.",
    type: "SERIES",
    releaseYear: 2017,
    genresCsv: "خيال علمي,غموض",
    moodTagsCsv: "ذهني,مظلم",
    directorOrCreator: "Baran bo Odar",
    runtimeMinutes: 52,
    totalSeasons: 3,
    seasonEpisodeCountsCsv: "10,8,8",
    currentSeason: 1,
    currentEpisode: 3,
    watchedEpisodesCount: 3,
    totalEpisodesCount: 26,
    status: "WATCHING",
    userRating: 9,
    userNotes: "Great series",
    communityScore: 9.1,
    posterStyle: "SCIFI",
    isFeatured: true,
    isCustom: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function validListPayload(uid, overrides = {}) {
  return {
    userId: uid,
    name: "Weekend Picks",
    description: "Top shows",
    accentColorKey: "crimson",
    mediaIds: ["ser_dark"],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

before(async () => {
  const rules = fs.readFileSync("./firestore.rules", "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: emulatorHost,
      port: emulatorPort,
    },
  });
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
});

test("Unauthenticated user cannot read or write media_entries or custom_lists", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(unauthDb.collection("users").doc(ALICE_UID).collection("media_entries").get());
  await assertFails(unauthDb.collection("users").doc(ALICE_UID).collection("custom_lists").get());
  await assertFails(
    unauthDb.collection("users").doc(ALICE_UID).collection("media_entries").doc("ser_dark").set(validMediaPayload(ALICE_UID))
  );
});

test("Authenticated owner can create, update, list, and delete their own media_entries", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const docRef = aliceDb.collection("users").doc(ALICE_UID).collection("media_entries").doc("ser_dark");
  await assertSucceeds(docRef.set(validMediaPayload(ALICE_UID)));
  await assertSucceeds(aliceDb.collection("users").doc(ALICE_UID).collection("media_entries").get());
  await assertSucceeds(
    docRef.update({
      currentEpisode: 4,
      watchedEpisodesCount: 4,
      updatedAt: new Date(),
    })
  );
  await assertSucceeds(docRef.delete());
});

test("Cross-user access to media_entries and custom_lists is denied", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  await assertSucceeds(
    aliceDb.collection("users").doc(ALICE_UID).collection("media_entries").doc("ser_dark").set(validMediaPayload(ALICE_UID))
  );

  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  await assertFails(bobDb.collection("users").doc(ALICE_UID).collection("media_entries").doc("ser_dark").get());
  await assertFails(bobDb.collection("users").doc(ALICE_UID).collection("media_entries").get());
  await assertFails(
    bobDb.collection("users").doc(ALICE_UID).collection("media_entries").doc("ser_dark").update({
      userRating: 1,
      updatedAt: new Date(),
    })
  );
  await assertFails(
    bobDb.collection("users").doc(ALICE_UID).collection("custom_lists").doc("list_1").set(validListPayload(BOB_UID))
  );
});

test("Shadow update with ghost field or invalid rating is rejected", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const docRef = aliceDb.collection("users").doc(ALICE_UID).collection("media_entries").doc("ser_dark");

  await assertFails(docRef.set(validMediaPayload(ALICE_UID, { ghostAdmin: true })));
  await assertFails(docRef.set(validMediaPayload(ALICE_UID, { userRating: 15 })));
  await assertFails(docRef.set(validMediaPayload(ALICE_UID, { userId: BOB_UID })));
});

test("Authenticated owner can create and update custom_lists, while invalid accentColorKey fails", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const listRef = aliceDb.collection("users").doc(ALICE_UID).collection("custom_lists").doc("list_1");
  await assertSucceeds(listRef.set(validListPayload(ALICE_UID)));
  await assertSucceeds(
    listRef.update({
      mediaIds: ["ser_dark", "mov_inception"],
      updatedAt: new Date(),
    })
  );
  await assertFails(
    aliceDb.collection("users").doc(ALICE_UID).collection("custom_lists").doc("list_bad").set(
      validListPayload(ALICE_UID, { accentColorKey: "neon_pink" })
    )
  );
});
