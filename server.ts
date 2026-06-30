/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

// Ensure Gemini Client is initialized safely
let ai: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("WARNING: GEMINI_API_KEY environment variable is not set. Using mock fallbacks.");
    }
    ai = new GoogleGenAI({
      apiKey: apiKey || 'MOCK_KEY',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return ai;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // 1. API: Multi-Agent Chat endpoint
  app.post('/api/agent/chat', async (req: express.Request, res: express.Response) => {
    try {
      const { message, agentId, agentName, systemInstruction, memoryContext } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      const isApiSet = apiKey && apiKey !== 'undefined' && apiKey !== 'null';

      if (!isApiSet) {
        // Mock fallback if API Key is not set
        return res.json({
          reply: `[MOCK - ${agentName}]: You asked: "${message}". Please configure your GEMINI_API_KEY in the Secrets panel to activate full autonomous reasoning and custom educational pathways! Currently running in local simulation mode.`,
          updatedMemory: memoryContext
        });
      }

      const client = getGeminiClient();
      
      const prompt = `
        User prompt: "${message}"
        
        Learner Cognitive Context:
        - Learning Style: ${memoryContext?.learningStyle || 'analogy'}
        - Competence Level: ${memoryContext?.difficultyLevel || 'intermediate'}
        - Streak Count: ${memoryContext?.studyStreak || 0}
        - Attention Span: ${memoryContext?.attentionSpan || 30} mins
        - Preferred Language: ${memoryContext?.preferredLanguage || 'English'}
        
        You are speaking as ${agentName} (${agentId}). Adhere closely to your role instruction:
        "${systemInstruction}"
        
        Deliver a highly pedagogical, clear, and context-aware answer matching the user's preferred language and learning style.
      `;

      const response = await client.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
        }
      });

      res.json({
        reply: response.text || "I was unable to synthesize a concept. Please try rephrasing.",
        updatedMemory: memoryContext
      });

    } catch (err: any) {
      console.error("Error in /api/agent/chat:", err);
      res.status(500).json({ error: err.message || "Failed to communicate with AI Agent" });
    }
  });

  // 2. API: Document / Text Concept Extraction
  app.post('/api/extract/document', async (req: express.Request, res: express.Response) => {
    try {
      const { textContent } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      const isApiSet = apiKey && apiKey !== 'undefined' && apiKey !== 'null';

      if (!isApiSet || !textContent || textContent.trim().length === 0) {
        // Mock fallback
        return res.json({
          concepts: [
            {
              id: 'extracted-concept-1',
              name: 'Sample Concept',
              category: 'Extracted Theory',
              description: 'This is a sample extracted concept placeholder. Enable your Gemini Key for live extraction!',
              definition: 'The placeholder value illustrating how StudyMate parses text documents.',
              example: 'Using StudyMate AI local preview offline.',
              equations: 'E = mc^2',
              importance: 'medium'
            }
          ],
          relationships: []
        });
      }

      const client = getGeminiClient();
      const prompt = `Analyze the following lecture notes/document text. Extract up to 3 core concepts and their relationship mappings. Return strictly valid JSON adhering to the specified schema:
      
      --- TEXT ---
      ${textContent}
      `;

      const response = await client.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          systemInstruction: "You are an expert Education Research AI specializing in knowledge extraction and curriculum mapping.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              concepts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING, description: "Kebab-case alphanumeric unique ID e.g. neural-networks" },
                    name: { type: Type.STRING, description: "Capitalized human readable name" },
                    category: { type: Type.STRING, description: "The academic domain or category" },
                    description: { type: Type.STRING, description: "One-sentence high level summary" },
                    definition: { type: Type.STRING, description: "Formal detailed academic definition" },
                    example: { type: Type.STRING, description: "A concrete real-world analogy or example" },
                    equations: { type: Type.STRING, description: "Associated mathematical equations, formulas, or code blocks if applicable" },
                    importance: { type: Type.STRING, description: "Must be: high, medium, or low" }
                  },
                  required: ["id", "name", "category", "description", "definition", "example", "importance"]
                }
              },
              relationships: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    source: { type: Type.STRING, description: "id of the source concept" },
                    target: { type: Type.STRING, description: "id of the target concept" },
                    type: { type: Type.STRING, description: "Must be: requires, explains, implements, extends, or similar verb" }
                  },
                  required: ["source", "target", "type"]
                }
              }
            },
            required: ["concepts", "relationships"]
          }
        }
      });

      let data = { concepts: [], relationships: [] };
      const rawText = response.text ? response.text.trim() : '';
      if (rawText && rawText !== 'undefined' && rawText !== 'null') {
        try {
          data = JSON.parse(rawText);
        } catch (e) {
          console.error("Failed to parse extracted concepts JSON:", rawText, e);
        }
      }
      res.json(data);

    } catch (err: any) {
      console.error("Error in /api/extract/document:", err);
      res.status(500).json({ error: err.message || "Failed to extract concepts from text" });
    }
  });

  // 3. API: Socratic Quiz Generator
  app.post('/api/quiz/generate', async (req: express.Request, res: express.Response) => {
    try {
      const { conceptName, conceptDefinition, difficulty } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      const isApiSet = apiKey && apiKey !== 'undefined' && apiKey !== 'null';

      if (!isApiSet) {
        // Return structured mock questions
        return res.json({
          questions: [
            {
              id: 'q1',
              type: 'mcq',
              question: `Which of the following best represents the primary goal of optimizing ${conceptName}?`,
              options: ['Minimizing computational complexity', 'Increasing parameter latency', 'Maximizing structural errors', 'Bypassing active recall constraints'],
              correctAnswer: 'Minimizing computational complexity',
              explanation: 'Optimization always aims to increase overall throughput and efficiency, which relates closely to minimizing computational overhead.'
            },
            {
              id: 'q2',
              type: 'tf',
              question: `Is ${conceptName} strictly applicable only to beginner learners?`,
              options: ['True', 'False'],
              correctAnswer: 'False',
              explanation: `No, ${conceptName} spans beginner, intermediate, and advanced levels.`
            }
          ]
        });
      }

      const client = getGeminiClient();
      const prompt = `Generate an active-recall quiz consisting of 3 challenging questions testing the concept of "${conceptName}".
      Definition of concept: "${conceptDefinition}"
      Target Difficulty: ${difficulty || 'intermediate'}.
      Include 1 Multiple Choice Question, 1 True/False Question, and 1 Complex Case Study/Scenario Question.`;

      const response = await client.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          systemInstruction: "You are the Socratic Evaluator. You generate rigorous active-recall questions that test deep conceptual understanding and practical application, rather than simple rote memorization.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    type: { type: Type.STRING, description: "Must be: mcq, tf, short, or case" },
                    question: { type: Type.STRING },
                    options: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "List of options if type is mcq or tf. For tf, options must be ['True', 'False']"
                    },
                    correctAnswer: { type: Type.STRING, description: "Exact matching correct choice string" },
                    explanation: { type: Type.STRING, description: "Step by step explanation of the answer and why other distractors are wrong." }
                  },
                  required: ["id", "type", "question", "correctAnswer", "explanation"]
                }
              }
            },
            required: ["questions"]
          }
        }
      });

      let data = { questions: [] };
      const rawText = response.text ? response.text.trim() : '';
      if (rawText && rawText !== 'undefined' && rawText !== 'null') {
        try {
          data = JSON.parse(rawText);
        } catch (e) {
          console.error("Failed to parse generated quiz JSON:", rawText, e);
        }
      }
      res.json(data);

    } catch (err: any) {
      console.error("Error in /api/quiz/generate:", err);
      res.status(500).json({ error: err.message || "Failed to generate Socratic quiz" });
    }
  });

  // 4. API: Career Path alignment generator
  app.post('/api/career/pathway', async (req: express.Request, res: express.Response) => {
    try {
      const { targetRole, background } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      const isApiSet = apiKey && apiKey !== 'undefined' && apiKey !== 'null';

      if (!isApiSet) {
        // Structured mock pathway
        return res.json({
          title: targetRole || "AI Research Architect",
          description: `A custom path mapping your route from ${background || 'student'} to a distinguished ${targetRole || 'AI Research Architect'}.`,
          skills: ['Deep Learning frameworks', 'Vector Database optimization', 'D3 visualization', 'Dynamic graph networks'],
          certifications: ['StudyMate Master Certificate', 'TensorFlow Developer Certified', 'AWS Machine Learning Specialty'],
          resources: ['DeepMind Learning lectures', 'Google AI research bulletins', 'Stanford CS231n'],
          roadmap: [
            { step: 'Phase 1: Foundations', desc: 'Master multivariate calculus, optimization algorithms, and advanced Python frameworks.', duration: '2 months' },
            { step: 'Phase 2: Architectural Specialization', desc: 'Understand Transformers, multi-agent communication pipelines, and tensor parallelisms.', duration: '3 months' }
          ]
        });
      }

      const client = getGeminiClient();
      const prompt = `Design a customized career development roadmap to transition from:
      - Current Background: "${background || 'general student'}"
      - Desired Professional Goal: "${targetRole}"
      
      Generate skills, certifications, resources, and a 4-step progressive roadmap timeline.`;

      const response = await client.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          systemInstruction: "You are the Industry Pathfinder. Your purpose is to bridge theoretical education and modern professional success, mapping optimal career paths.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              skills: { type: Type.ARRAY, items: { type: Type.STRING } },
              certifications: { type: Type.ARRAY, items: { type: Type.STRING } },
              resources: { type: Type.ARRAY, items: { type: Type.STRING } },
              roadmap: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    step: { type: Type.STRING },
                    desc: { type: Type.STRING },
                    duration: { type: Type.STRING }
                  },
                  required: ["step", "desc", "duration"]
                }
              }
            },
            required: ["title", "description", "skills", "certifications", "resources", "roadmap"]
          }
        }
      });

      let data = {};
      const rawText = response.text ? response.text.trim() : '';
      if (rawText && rawText !== 'undefined' && rawText !== 'null') {
        try {
          data = JSON.parse(rawText);
        } catch (e) {
          console.error("Failed to parse career pathway JSON:", rawText, e);
        }
      }
      res.json(data);

    } catch (err: any) {
      console.error("Error in /api/career/pathway:", err);
      res.status(500).json({ error: err.message || "Failed to align career path" });
    }
  });

  // Vite integration middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`StudyMate AI server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
