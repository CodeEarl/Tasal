// functions/index.js
const { onRequest } = require("firebase-functions/v2/https");
const { GoogleGenAI, Type } = require("@google/genai");
const cors = require("cors")({ origin: true });

// Initialize Gemini Client with Secret Key
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    oneLineTarget: {
      type: Type.STRING,
      description: "One precise sentence capturing seniority, specialisation, industry/domain, and key background.",
    },
    underlyingNeedSummary: {
      type: Type.STRING,
      description: "Recruiter translation of what the founder actually needs vs what they said.",
    },
    mustHaves: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          requirement: { type: Type.STRING },
          reasoning: { type: Type.STRING },
          category: { type: Type.STRING, enum: ["must-have"] }
        },
        required: ["id", "requirement", "reasoning", "category"]
      }
    },
    niceToHaves: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          requirement: { type: Type.STRING },
          reasoning: { type: Type.STRING },
          category: { type: Type.STRING, enum: ["nice-to-have"] }
        },
        required: ["id", "requirement", "reasoning", "category"]
      }
    },
    needsClarification: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          item: { type: Type.STRING },
          note: { type: Type.STRING }
        },
        required: ["id", "item", "note"]
      }
    },
    conflictsAndRedFlags: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          type: { type: Type.STRING, enum: ["Contradiction", "Unrealistic Expectation", "Missing Information", "Trade-off Required"] },
          conflictDescription: { type: Type.STRING },
          whyChallenging: { type: Type.STRING },
          practicalResolution: { type: Type.STRING }
        },
        required: ["title", "type", "conflictDescription", "whyChallenging", "practicalResolution"]
      }
    },
    talentMapping: {
      type: Type.OBJECT,
      properties: {
        companyTypes: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        jobTitles: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        searchKeywords: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        booleanSearchStrings: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              description: { type: Type.STRING },
              query: { type: Type.STRING }
            },
            required: ["label", "description", "query"]
          }
        },
        idealCandidateBackground: {
          type: Type.STRING,
          description: "Summary of typical career trajectory, experience milestones, and signals."
        }
      },
      required: ["companyTypes", "jobTitles", "searchKeywords", "booleanSearchStrings", "idealCandidateBackground"]
    },
    kickoffQuestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          rationale: { type: Type.STRING },
          targetArea: { type: Type.STRING }
        },
        required: ["question", "rationale", "targetArea"]
      }
    },
    tradeOffRecommendations: {
      type: Type.STRING,
      description: "Recruiter advice on which requirements can be relaxed if market response is slow."
    }
  },
  required: [
    "oneLineTarget",
    "underlyingNeedSummary",
    "mustHaves",
    "niceToHaves",
    "conflictsAndRedFlags",
    "talentMapping",
    "kickoffQuestions",
    "tradeOffRecommendations"
  ]
};

exports.analyseBrief = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { briefText, userFeedback } = req.body;

  if (!briefText || briefText.trim().length < 35) {
    return res.status(400).json({
      error: "Hiring brief is too brief. Please provide at least 1-2 descriptive sentences detailing the role."
    });
  }

  const systemInstruction = `
You are an elite Talent Sourcing Lead and Executive Recruiter with 15+ years of experience conducting recruitment kickoff calls with startup founders and hiring managers.

Your role is to critically analyze unstructured, messy, contradictory, or vague founder hiring briefs and transform them into an actionable talent mapping strategy.

Guidelines:
1. Distinguish between what the founder EXPLICITLY stated vs what they IMPLICITLY need.
2. NEVER hallucinate salaries, specific unmentioned qualifications, or candidate company histories. If compensation or key parameters are missing, highlight them as missing information.
3. Critically separate 'Must-Haves' from 'Nice-to-Haves'. Founders often treat all wishes as must-haves. Be practical.
4. Flag real conflicts (e.g. low budget vs senior lead, immediate availability vs employed executives, unicorn multi-discipline requirements). If the brief has zero conflicts, state that explicitly.
5. Provide actionable Boolean search strings using standard syntax: AND, OR, NOT, parentheses, and quoted phrases. Provide at least two distinct variations (e.g. Title-driven vs Skill/Domain-driven).
6. Formulate 3 to 5 kickoff questions that sound natural, consultative, and direct.
`;

  const userPrompt = userFeedback 
    ? `ORIGINAL BRIEF:\n${briefText}\n\nUSER UPDATES/FEEDBACK FOR REGENERATION:\n${userFeedback}`
    : `ANALYSE THIS HIRING BRIEF:\n${briefText}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: ANALYSIS_SCHEMA,
        temperature: 0.2
      }
    });

    const parsedData = JSON.parse(response.text);
    return res.status(200).json(parsedData);
  } catch (err) {
    console.error("Gemini Generation Error:", err);
    return res.status(500).json({
      error: "Failed to generate recruitment analysis. " + (err.message || "")
    });
  }
});