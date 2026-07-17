import type { PlantHypothesis } from "@/types/plant";

export type SpeciesProfileId = "monstera_deliciosa" | "cactus_succulent" | "calathea";

export type SpeciesQuestionGuidance = {
  hypothesis: PlantHypothesis;
  priority: "high" | "medium" | "low";
  askWhen: string;
  changes: string;
};

export type SpeciesCareProfile = {
  id: SpeciesProfileId;
  aliases: string[];
  displayName: string;
  preferredLight: string;
  wateringPattern: string;
  soil: string;
  humidity: string;
  temperature: string;
  growthBehavior: string;
  repotting: string;
  commonMistakes: string[];
  normalBehaviors: string[];
  warningSigns: string[];
  beginnerTips: string[];
  commonPests: string[];
  diseaseRisks: string[];
  questionGuidance: SpeciesQuestionGuidance[];
};

export type SpeciesProfileMatchInput = {
  detectedSpecies?: unknown;
  scientificName?: unknown;
  commonName?: unknown;
};

export const speciesCareProfiles: SpeciesCareProfile[] = [
  {
    id: "monstera_deliciosa",
    aliases: ["monstera deliciosa", "monstera", "swiss cheese plant", "монстера", "монстера деликатесная"],
    displayName: "Monstera deliciosa",
    preferredLight: "Prefers bright indirect light; harsh direct sun can scorch leaves, while too little light slows growth.",
    wateringPattern: "Water after the upper soil has dried; consistently wet soil raises root-risk faster than brief dryness.",
    soil: "Likes an airy, chunky mix that drains well around thick roots.",
    humidity: "Moderate to higher humidity helps leaf edges, but humidity is secondary to light and watering.",
    temperature: "Likes normal warm room temperatures and dislikes cold drafts.",
    growthBehavior: "Climbs as it matures; new leaves may gradually become larger and more fenestrated.",
    repotting: "Can pause or show older leaf stress after repotting; do not repot again unless root damage or severe soil issues are confirmed.",
    commonMistakes: ["treating bright light as direct sun", "watering on a fixed schedule", "using dense soil that stays wet"],
    normalBehaviors: ["aerial roots are normal", "young leaves may not have splits or holes", "older leaves can keep old cosmetic damage"],
    warningSigns: ["new spreading yellowing", "black soft patches", "pest speckling or sticky residue", "soil staying wet for many days"],
    beginnerTips: ["give support as it grows", "rotate toward light gradually", "judge watering by soil feel rather than the calendar"],
    commonPests: ["thrips", "spider mites", "scale"],
    diseaseRisks: ["root stress from prolonged wet soil", "leaf scorch from direct sun"],
    questionGuidance: [
      {
        hypothesis: "direct_sun",
        priority: "high",
        askWhen: "Ask when leaf scorch, bleaching, dry patches, or damaged edges are visible and light history is unknown.",
        changes: "A yes answer shifts advice toward bright indirect light and makes sun stress the leading explanation."
      },
      {
        hypothesis: "soil_condition",
        priority: "high",
        askWhen: "Ask when yellowing, droop, or wet-looking soil could change watering advice today.",
        changes: "Moist or very wet soil means do not water; dry soil may justify watering if symptoms fit."
      },
      {
        hypothesis: "pests",
        priority: "medium",
        askWhen: "Ask only with stippling, specks, webbing, sticky residue, or leaf-close-up signs.",
        changes: "Confirmed pests make treatment urgent; no pests lets the recommendation focus on light or watering."
      },
      {
        hypothesis: "drainage",
        priority: "medium",
        askWhen: "Ask when soil appears persistently wet or the pot/soil photo suggests poor drainage.",
        changes: "No drainage increases root-risk and changes the next action from routine waiting to drainage correction."
      }
    ]
  },
  {
    id: "cactus_succulent",
    aliases: [
      "cactus",
      "cacti",
      "succulent",
      "succulents",
      "portulacaria afra",
      "zamioculcas",
      "zz plant",
      "echeveria",
      "haworthia",
      "aloe",
      "кактус",
      "суккулент",
      "портулакария",
      "замиокулькас"
    ],
    displayName: "cactus or drought-tolerant succulent",
    preferredLight: "Usually wants strong bright light; some acclimated plants tolerate direct sun, but sudden harsh sun can still burn tissue.",
    wateringPattern: "Dry soil is often normal. Water only after the mix dries well, and be more cautious after recent watering.",
    soil: "Needs a gritty, fast-draining mix; dense wet soil is a bigger risk than short dry periods.",
    humidity: "Low household humidity is usually fine and rarely the first concern.",
    temperature: "Prefers warm rooms and should be protected from cold wet conditions.",
    growthBehavior: "Often grows in slow pulses and may look unchanged for long periods.",
    repotting: "Often pauses after repotting and should not be repotted again unless rot or severe soil problems are confirmed.",
    commonMistakes: ["watering because the top looks dry", "keeping soil slightly moist", "moving suddenly into harsh sun"],
    normalBehaviors: ["dry soil between waterings is normal", "slow growth can be normal", "older corky marks may not heal"],
    warningSigns: ["soft translucent tissue", "black mushy base", "soil staying wet for days", "sudden bleaching after a light change"],
    beginnerTips: ["when unsure, wait before watering", "use a fast-draining potting mix", "increase light gradually"],
    commonPests: ["mealybugs", "scale", "spider mites"],
    diseaseRisks: ["rot from prolonged moisture", "sunburn after abrupt light changes"],
    questionGuidance: [
      {
        hypothesis: "soil_condition",
        priority: "high",
        askWhen: "Ask when the visible condition could be from either dehydration or excess moisture.",
        changes: "Dry soil is not automatically a problem; very wet soil usually means pause watering and check drainage."
      },
      {
        hypothesis: "drainage",
        priority: "high",
        askWhen: "Ask when the soil is wet, dense, or symptoms suggest rot risk.",
        changes: "Poor drainage makes wet soil more serious for succulents than for many foliage plants."
      },
      {
        hypothesis: "direct_sun",
        priority: "medium",
        askWhen: "Ask when there are scorch, bleaching, or dry patches after a light change.",
        changes: "A yes answer supports acclimation/sun stress; a no answer shifts focus back to watering or roots."
      },
      {
        hypothesis: "pests",
        priority: "medium",
        askWhen: "Ask only if close-up photos show cottony residue, scale bumps, stippling, or webbing.",
        changes: "Confirmed pests change the first action to isolation and treatment."
      }
    ]
  },
  {
    id: "calathea",
    aliases: ["calathea", "goeppertia", "maranta", "prayer plant", "калатея", "маранта"],
    displayName: "Calathea / prayer plant",
    preferredLight: "Prefers medium to bright indirect light; direct sun can fade or crisp leaves.",
    wateringPattern: "Likes evenly light moisture but not soggy soil; complete dry-down can quickly cause curling or crispy edges.",
    soil: "Needs moisture-retentive but airy soil with reliable drainage.",
    humidity: "High humidity and stable warmth matter more than for many houseplants.",
    temperature: "Likes stable warmth and reacts badly to cold drafts or chilly windows.",
    growthBehavior: "Leaves naturally move up and down through the day and night.",
    repotting: "Can sulk after repotting; avoid repeated root disturbance unless root health is clearly poor.",
    commonMistakes: ["letting the soil fully dry", "placing in direct sun", "using hard tap water without considering sensitivity"],
    normalBehaviors: ["leaf movement through the day is normal", "minor older edge crisping may remain", "new leaves can unfurl slowly"],
    warningSigns: ["rapid curling with dry soil", "crispy edges spreading on new leaves", "fading from direct sun", "webbing or stippling from mites"],
    beginnerTips: ["keep moisture steady", "avoid direct sun", "consider softer water if edges keep crisping"],
    commonPests: ["spider mites", "thrips"],
    diseaseRisks: ["leaf edge crisping from dry air or water stress", "root stress from soggy soil"],
    questionGuidance: [
      {
        hypothesis: "soil_condition",
        priority: "high",
        askWhen: "Ask when curling, crispy edges, yellowing, or droop could change watering advice today.",
        changes: "Dry soil often means water sooner; very wet soil means avoid watering and check drainage."
      },
      {
        hypothesis: "direct_sun",
        priority: "high",
        askWhen: "Ask when fading, crisp patches, or window exposure could explain leaf damage.",
        changes: "Direct sun makes light correction more important than fertilizer or repotting."
      },
      {
        hypothesis: "pests",
        priority: "medium",
        askWhen: "Ask with stippling, fine webbing, or leaf-close-up signs because spider mites are common.",
        changes: "Confirmed pests change the advice from humidity/care adjustment to inspection and treatment."
      },
      {
        hypothesis: "drainage",
        priority: "medium",
        askWhen: "Ask when soil is very wet or the pot may trap water.",
        changes: "Poor drainage explains why a moisture-loving plant can still suffer from wet roots."
      }
    ]
  }
];

function textFromUnknown(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const localized = value as { en?: unknown; ru?: unknown };
    return [localized.en, localized.ru].filter((item): item is string => typeof item === "string").join(" ");
  }
  return "";
}

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

export function selectSpeciesCareProfile(input: SpeciesProfileMatchInput) {
  const searchText = normalize([textFromUnknown(input.detectedSpecies), textFromUnknown(input.scientificName), textFromUnknown(input.commonName)].join(" "));
  if (!searchText) return null;

  return speciesCareProfiles.find((profile) => profile.aliases.some((alias) => searchText.includes(normalize(alias)))) ?? null;
}

export function speciesProfilesPromptContext() {
  return JSON.stringify(
    speciesCareProfiles.map((profile) => ({
      id: profile.id,
      aliases: profile.aliases,
      displayName: profile.displayName,
      traits: {
        preferredLight: profile.preferredLight,
        wateringPattern: profile.wateringPattern,
        soil: profile.soil,
        humidity: profile.humidity,
        temperature: profile.temperature,
        growthBehavior: profile.growthBehavior,
        repotting: profile.repotting
      },
      commonMistakes: profile.commonMistakes,
      normalBehaviors: profile.normalBehaviors,
      warningSigns: profile.warningSigns,
      beginnerTips: profile.beginnerTips,
      commonPests: profile.commonPests,
      diseaseRisks: profile.diseaseRisks,
      questionGuidance: profile.questionGuidance
    }))
  );
}

export function speciesTraitsForAnalysis(profile: SpeciesCareProfile | null) {
  if (!profile) return [];
  return [profile.preferredLight, profile.wateringPattern, profile.soil, profile.humidity, profile.temperature, profile.growthBehavior, profile.repotting];
}
