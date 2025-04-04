const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();
const app = express();

// Updated CORS configuration to handle preflight requests and allow necessary headers
app.use(
  cors({
    origin: ["https://trainwithme.in", "http://localhost:3000"],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Handle preflight OPTIONS requests explicitly
app.options("*", cors());

app.use(express.json());

// OpenAI API Setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  defaultHeaders: { "OpenAI-Beta": "assistants=v2" }
});

// Use Assistant ID from .env
const assistantId = process.env.ASSISTANT_ID;

// File IDs for Reference Books
const fileIds = {
  TamilnaduHistory: "file-UyQKVs91xYHfadeHSjdDw2",
  Spectrum: "file-UwRi9bH3uhVh4YBXNbMv1w",
  ArtAndCulture: "file-Gn3dsACNC2MP2xS9QeN3Je",
  FundamentalGeography: "file-CMWSg6udmgtVZpNS3tDGHW",
  IndianGeography: "file-U1nQNyCotU2kcSgF6hrarT",
  Atlas: "pending",
  Science: "file-TGgc65bHqVMxpmj5ULyR6K",
  Environment: "file-Yb1cfrHMATDNQgyUa6jDqw",
  Economy: "file-TJ5Djap1uv4fZeyM5c6sKU",
  EconomicSurvey2025: "[TBD - Economic Survey file ID]",
  CSAT: "file-TGgc65bHqVMxpmj5ULyR6K",
  CurrentAffairs: "file-5BX6sBLZ2ws44NBUTbcyWg",
  PreviousYearPaper: "file-TGgc65bHqVMxpmj5ULyR6K",
  Polity: "file-G15UzpuvCRuMG4g6ShCgFK",
};

// Map categories to their respective books and file IDs
const categoryToBookMap = {
  TamilnaduHistory: {
    bookName: "Tamilnadu History Book",
    fileId: fileIds.TamilnaduHistory,
    description: "Published by Tamilnadu Government, covering Indian history"
  },
  Spectrum: {
    bookName: "Spectrum Book",
    fileId: fileIds.Spectrum,
    description: "Spectrum book for Modern Indian History"
  },
  ArtAndCulture: {
    bookName: "Nitin Singhania Art and Culture Book",
    fileId: fileIds.ArtAndCulture,
    description: "Nitin Singhania book for Indian Art and Culture"
  },
  FundamentalGeography: {
    bookName: "NCERT Class 11th Fundamentals of Physical Geography",
    fileId: fileIds.FundamentalGeography,
    description: "NCERT Class 11th book on Fundamental Geography"
  },
  IndianGeography: {
    bookName: "NCERT Class 11th Indian Geography",
    fileId: fileIds.IndianGeography,
    description: "NCERT Class 11th book on Indian Geography"
  },
  Atlas: {
    bookName: "Atlas",
    fileId: fileIds.Atlas,
    description: "General knowledge or internet-based (file pending)"
  },
  Science: {
    bookName: "Disha IAS Previous Year Papers (Science Section)",
    fileId: fileIds.Science,
    description: "Disha IAS book, Science section (Physics, Chemistry, Biology, Science & Technology)"
  },
  Environment: {
    bookName: "Shankar IAS Environment Book",
    fileId: fileIds.Environment,
    description: "Shankar IAS book for Environment"
  },
  Economy: {
    bookName: "Ramesh Singh Indian Economy Book",
    fileId: fileIds.Economy,
    description: "Ramesh Singh book for Indian Economy"
  },
  CSAT: {
    bookName: "Disha IAS Previous Year Papers (CSAT Section)",
    fileId: fileIds.CSAT,
    description: "Disha IAS book, CSAT section"
  },
  CurrentAffairs: {
    bookName: "Vision IAS Current Affairs Magazine",
    fileId: fileIds.CurrentAffairs,
    description: "Vision IAS Current Affairs resource"
  },
  PreviousYearPaper: {
    bookName: "Disha IAS Previous Year Papers",
    fileId: fileIds.PreviousYearPaper,
    description: "Disha IAS book for Previous Year Papers"
  },
  Polity: {
    bookName: "Laxmikanth Book",
    fileId: fileIds.Polity,
    description: "Laxmikanth book for Indian Polity"
  }
};

// Store user threads (in-memory for simplicity)
const userThreads = new Map();

// Thread lock to prevent concurrent requests on the same thread
const threadLocks = new Map();

// Track the number of questions generated per user session
const questionCounts = new Map();

const acquireLock = async (threadId) => {
  while (threadLocks.get(threadId)) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  threadLocks.set(threadId, true);
};

const releaseLock = (threadId) => {
  threadLocks.delete(threadId);
};

// Update Assistant to Include File Search with Vector Store
const updateAssistantWithFiles = async () => {
  try {
    const validFileIds = Object.values(fileIds).filter(
      fileId => fileId && fileId !== "pending" && !fileId.startsWith("[TBD")
    );

    for (const fileId of validFileIds) {
      try {
        const file = await openai.files.retrieve(fileId);
        console.log(`File ${fileId} verified: ${file.filename}`);
      } catch (error) {
        console.error(`Error verifying file ${fileId}:`, error.message);
        const index = validFileIds.indexOf(fileId);
        if (index !== -1) {
          validFileIds.splice(index, 1);
        }
      }
    }

    const vectorStore = await openai.beta.vectorStores.create({
      name: "UPSC Books Vector Store",
      file_ids: validFileIds
    });

    const assistant = await openai.beta.assistants.update(assistantId, {
      tools: [{ type: "file_search" }],
      tool_resources: {
        file_search: {
          vector_store_ids: [vectorStore.id]
        }
      }
    });
    console.log(`✅ Assistant ${assistantId} updated with file search tool and vector store ID: ${vectorStore.id}`);
  } catch (error) {
    console.error("❌ Error updating assistant with file search:", error.message);
  }
};

// Call this function when the server starts
updateAssistantWithFiles();

// Function to wait for a run to complete
const waitForRunToComplete = async (threadId, runId) => {
  while (true) {
    const runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
    if (runStatus.status === "completed" || runStatus.status === "failed") {
      return runStatus.status;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
};

// Function to wait for all active runs to complete
const waitForAllActiveRuns = async (threadId) => {
  let activeRuns = [];
  do {
    const runs = await openai.beta.threads.runs.list(threadId);
    activeRuns = runs.data.filter(run => run.status === "in_progress" || run.status === "queued");
    for (const activeRun of activeRuns) {
      await waitForRunToComplete(threadId, activeRun.id);
    }
  } while (activeRuns.length > 0);
};

app.post("/ask", async (req, res) => {
  let responseText = "No response available.";
  try {
    const { query, category, userId } = req.body;

    // Validate category
    if (!categoryToBookMap[category]) {
      throw new Error(`Invalid category: ${category}. Please provide a valid subject category.`);
    }

    const bookInfo = categoryToBookMap[category];
    const fileId = bookInfo.fileId;

    // Check if the file ID is valid for processing
    if (!fileId || fileId === "pending" || fileId.startsWith("[TBD")) {
      throw new Error(`File for category ${category} is not available (File ID: ${fileId}). MCQs cannot be generated.`);
    }

    let threadId = userThreads.get(userId);
    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      userThreads.set(userId, threadId);
    }

    // Acquire a lock for this thread to prevent concurrent requests
    await acquireLock(threadId);

    try {
      // Wait for all active runs to complete before proceeding
      await waitForAllActiveRuns(threadId);

      // Extract the chapter name from the query
      const chapterMatch = query.match(/Generate 1 MCQ from (.*?) of the Laxmikanth Book/);
      const chapter = chapterMatch ? chapterMatch[1] : null;

      // Extract the question index from the userId (format: userId-index)
      const userIdParts = userId.split('-');
      const questionIndex = userIdParts.length > 1 ? parseInt(userIdParts[userIdParts.length - 1], 10) : 0;

      // Track the number of questions generated for this user session
      const baseUserId = userIdParts.slice(0, -1).join('-');
      const questionCountKey = `${baseUserId}:${chapter || 'entire-book'}`;
      let questionCount = questionCounts.get(questionCountKey) || 0;
      questionCount++;
      questionCounts.set(questionCountKey, questionCount);

      // Log the chapter and question count
      console.log(`Received request for userId ${userId}, chapter: ${chapter}, question count: ${questionCount}`);

      // Define the threshold for when to allow related questions
      const chapterContentThreshold = 20; // After 20 questions, allow related questions

      const generalInstruction = `
        You are an AI trained exclusively on UPSC Books for the TrainWithMe platform, but you can use your general knowledge when explicitly allowed.

        📚 Reference Book for This Query:  
        - Category: ${category}  
        - Book: ${bookInfo.bookName}  
        - File ID: ${fileId}  
        - Description: ${bookInfo.description}  

        **Instructions for MCQ Generation:**  
        - Generate 1 MCQ from the specified book (${bookInfo.bookName}) using the attached file (File ID: ${fileId}).  
        - If a chapter is specified, you MUST prioritize generating the MCQ from the content of that chapter ("${chapter}") of the book. Use ONLY the content from the specified chapter for the first ${chapterContentThreshold} questions in the user session.  
        - After generating ${chapterContentThreshold} questions (this is question number ${questionCount} in the session), if you cannot find new, non-repetitive content in the specified chapter, you MAY use your general knowledge to generate an MCQ that is conceptually related to the chapter's topic. Ensure the related MCQ is relevant to the chapter's subject matter (e.g., for "Supreme Court," generate questions about judicial review, landmark cases, or constitutional provisions related to the judiciary).  
        - If no chapter is specified, generate the MCQ from the entire book, but do NOT use content outside of the book unless explicitly allowed.  
        - The MCQ MUST be generated in one of the following 5 structures. Choose the structure that best fits the content to ensure the MCQ is meaningful and relevant. Do NOT force a structure that does not suit the content.  
        - Ensure the MCQ is difficult but do not mention this in the response.  
        - If you cannot generate a relevant MCQ (either from the chapter or related to the chapter's topic) in any of the 5 structures, return an error message: "Unable to generate a relevant MCQ for '${chapter}' of the ${bookInfo.bookName}. Please try a different chapter or the entire book."  

        **Available MCQ Structures (Choose the most suitable one):**  
        1. **Statement-Based**: Generate the MCQ with 3 numbered statements followed by "How many of the above statements are correct?" Provide exactly 4 options: (a) Only one, (b) Only two, (c) All three, (d) None.  
           Example:  
           Question: Consider the following statements regarding Fundamental Rights:  
           1. They are absolute and cannot be suspended.  
           2. They are available only to citizens.  
           3. The Right to Property is a Fundamental Right.  
           How many of the above statements are correct?  
           Options:  
           (a) Only one  
           (b) Only two  
           (c) All three  
           (d) None  
           Correct Answer: (d)  
           Explanation: Fundamental Rights can be suspended during a National Emergency (except Articles 20 and 21), are available to both citizens and foreigners (e.g., Article 14), and the Right to Property is no longer a Fundamental Right due to the 44th Amendment.

        2. **Assertion-Reason**: Generate the MCQ with two statements labeled "Assertion (A)" and "Reason (R)". Provide exactly 4 options: (a) Both A and R are true, and R is the correct explanation of A, (b) Both A and R are true, but R is NOT the correct explanation of A, (c) A is true, but R is false, (d) A is false, but R is true.  
           Example:  
           Question:  
           Assertion (A): The Indian National Congress adopted the policy of non-cooperation in 1920.  
           Reason (R): The Rowlatt Act and Jallianwala Bagh massacre created widespread discontent.  
           Options:  
           (a) Both A and R are true, and R is the correct explanation of A  
           (b) Both A and R are true, but R is NOT the correct explanation of A  
           (c) A is true, but R is false  
           (d) A is false, but R is true  
           Correct Answer: (a)  
           Explanation: The Rowlatt Act (1919) and the Jallianwala Bagh massacre (1919) led to widespread discontent, which prompted the Indian National Congress to adopt the Non-Cooperation Movement in 1920 under Mahatma Gandhi's leadership. Thus, R correctly explains A.

        3. **Multiple Statements with Specific Combinations**: Generate the MCQ with 3 numbered statements followed by options specifying combinations. Provide exactly 4 options: (a) 1 and 2 only, (b) 2 and 3 only, (c) 1 and 3 only, (d) 1, 2, and 3.  
           Example:  
           Question: With reference to agricultural soils, consider the following statements:  
           1. A high content of organic matter in soil drastically reduces its water-holding capacity.  
           2. Soil does not play any role in the nitrogen cycle.  
           3. Irrigation over a long period of time can contribute to soil salinity.  
           Which of the statements given above is/are correct?  
           Options:  
           (a) 1 and 2 only  
           (b) 2 and 3 only  
           (c) 1 and 3 only  
           (d) 1, 2, and 3  
           Correct Answer: (b)  
           Explanation: Statement 1 is incorrect because a high content of organic matter increases the water-holding capacity of soil. Statement 2 is incorrect as soil plays a significant role in the nitrogen cycle through processes like nitrogen fixation. Statement 3 is correct because long-term irrigation can lead to soil salinity due to the accumulation of salts.

        4. **Chronological Order**: Generate the MCQ with a list of 4 events or items to be arranged in chronological order. The question MUST start with "Arrange the following events in chronological order:". Provide exactly 4 options: (a) 1, 2, 3, 4, (b) 2, 1, 3, 4, (c) 1, 3, 2, 4, (d) 3, 2, 1, 4.  
           Example:  
           Question: Arrange the following events in chronological order:  
           1. Battle of Plassey  
           2. Third Battle of Panipat  
           3. Regulating Act of 1773  
           4. Treaty of Bassein  
           Select the correct order:  
           Options:  
           (a) 1, 2, 3, 4  
           (b) 2, 1, 3, 4  
           (c) 1, 3, 2, 4  
           (d) 3, 2, 1, 4  
           Correct Answer: (a)  
           Explanation: The Battle of Plassey occurred in 1757, the Third Battle of Panipat in 1761, the Regulating Act was passed in 1773, and the Treaty of Bassein was signed in 1802. Thus, the correct chronological order is 1, 2, 3, 4.

        5. **Direct Question with Single Correct Answer**: Generate the MCQ with a single question and four options, where one is correct. Provide exactly 4 options: (a) [Option A], (b) [Option B], (c) [Option C], (d) [Option D].  
           Example:  
           Question: Which one of the following is a tributary of the Brahmaputra?  
           Options:  
           (a) Gandak  
           (b) Kosi  
           (c) Subansiri  
           (d) Yamuna  
           Correct Answer: (c)  
           Explanation: The Subansiri is a major tributary of the Brahmaputra, joining it in Assam. The Gandak and Kosi are tributaries of the Ganga, and the Yamuna is a tributary of the Ganga as well.

        **Response Structure for MCQs:**  
        - Use this EXACT structure for the response with PLAIN TEXT headers:  
          Question: [Full question text including statements, A/R, etc.]  
          Options:  
          (a) [Option A]  
          (b) [Option B]  
          (c) [Option C]  
          (d) [Option D]  
          Correct Answer: [Correct option letter, e.g., (a)]  
          Explanation: [Brief explanation, 2-3 sentences, based on the requested book and chapter or related knowledge]  
        - Separate each section with EXACTLY TWO newlines (\n\n).  
        - Start the response directly with "Question:"—do NOT include any introductory text.  
        - Use plain text headers ("Question:", "Options:", "Correct Answer:", "Explanation:") without any formatting.  

        **Special Instructions for Specific Categories:**  
        - For "Science": Generate MCQs only from the Science section (Physics, Chemistry, Biology, Science & Technology) of the Disha IAS Previous Year Papers book (File ID: ${fileIds.Science}).  
        - For "CSAT": Generate MCQs only from the CSAT section of the Disha IAS Previous Year Papers book (File ID: ${fileIds.CSAT}).  
        - For "PreviousYearPaper": Generate MCQs from the entire Disha IAS Previous Year Papers book (File ID: ${fileIds.PreviousYearPaper}), covering all relevant sections.  
        - For "Atlas": Since the file is pending, respond with an error message: "File for Atlas is not available. MCQs cannot be generated at this time."  

        **Chapter Constraint:**  
        - For the first ${chapterContentThreshold} questions, you MUST generate the MCQ ONLY from the chapter "${chapter}" of the ${bookInfo.bookName}. Do NOT use content from other chapters or external sources.  
        - After ${chapterContentThreshold} questions, if you cannot find new content in the chapter, you MAY generate an MCQ related to the chapter's topic using your general knowledge, ensuring relevance to the chapter's subject matter.  
        - If no chapter is specified, generate the MCQ from the entire ${bookInfo.bookName}, but do NOT use content outside of the book unless explicitly allowed.  

        **Now, generate a response based on the book: "${bookInfo.bookName}" (File ID: ${fileId}):**  
        "${query}"
      `;

      await openai.beta.threads.messages.create(threadId, {
        role: "user",
        content: generalInstruction,
      });

      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: assistantId,
        tools: [{ type: "file_search" }],
      });

      if (!run || !run.id) {
        throw new Error("Failed to create AI Run. Check OpenAI request.");
      }

      const runStatus = await waitForRunToComplete(threadId, run.id);
      if (runStatus === "failed") {
        throw new Error("AI request failed.");
      }

      const messages = await openai.beta.threads.messages.list(threadId);
      const latestMessage = messages.data.find(m => m.role === "assistant");
      responseText = latestMessage?.content[0]?.text?.value || "No response available.";

      // Log the AI's response for debugging
      console.log(`AI Response for userId ${userId}, chapter ${chapter}: ${responseText}`);

      // Log the structure used in the response
      if (responseText.includes("How many of the above statements are correct?")) {
        console.log(`Structure used for userId ${userId}, chapter ${chapter}: Statement-Based`);
      } else if (responseText.includes("Assertion (A)")) {
        console.log(`Structure used for userId ${userId}, chapter ${chapter}: Assertion-Reason`);
      } else if (responseText.includes("Which of the statements given above is/are correct?") && !responseText.includes("How many of the above statements are correct?")) {
        console.log(`Structure used for userId ${userId}, chapter ${chapter}: Multiple Statements with Specific Combinations`);
      } else if (responseText.includes("Arrange the following events in chronological order:")) {
        console.log(`Structure used for userId ${userId}, chapter ${chapter}: Chronological Order`);
      } else {
        console.log(`Structure used for userId ${userId}, chapter ${chapter}: Direct Question with Single Correct Answer`);
      }
    } finally {
      // Release the lock after processing
      releaseLock(threadId);
    }

    res.json({ answer: responseText });
  } catch (error) {
    console.error("Error from OpenAI:", error.message);
    res.status(500).json({ error: "AI service error", details: error.message });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => console.log(`Backend running on port ${PORT}`));