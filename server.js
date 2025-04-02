const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();
const app = express();
app.use(cors({ origin: ["https://trainwithme.in", "http://localhost:3000"] }));
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

// Function to validate the MCQ structure
const validateMCQStructure = (responseText, selectedStructure) => {
  const sections = responseText.split(/\n\n/).map(section => section.trim());
  const questionSection = sections.find(section => section.startsWith("Question:"))?.replace("Question: ", "");
  const questionLines = questionSection ? questionSection.split("\n").map(line => line.trim()) : [];

  console.log(`🔍 Validating ${selectedStructure} structure...`);
  console.log(`Question Lines:`, questionLines);

  switch (selectedStructure) {
    case "Statement-Based":
    case "Multiple Statements with Specific Combinations":
      const isStatementBased = (
        questionLines.some(line => /^\d+\./.test(line)) &&
        (questionLines.some(line => line.includes("Which of the statements given above is/are correct?")) ||
         questionLines.some(line => line.includes("How many of the above statements are correct?")))
      );
      console.log(`Statement-Based validation: ${isStatementBased}`);
      return isStatementBased;
    case "Assertion-Reason":
      const isAssertionReason = (
        questionLines.some(line => line.startsWith("Assertion (A):")) &&
        questionLines.some(line => line.startsWith("Reason (R):"))
      );
      console.log(`Assertion-Reason validation: ${isAssertionReason}`);
      return isAssertionReason;
    case "Matching Type":
    case "Correctly Matched Pairs":
      // Relax the space requirement to 2 or more spaces and check for table-like structure
      const hasTableStructure = questionLines.some(line => /\s{2,}/.test(line));
      const hasMatchingPairs = questionLines.some(line => /^\([A-D]\)/.test(line));
      console.log(`Matching Type/Correctly Matched Pairs validation - Has table structure: ${hasTableStructure}, Has matching pairs: ${hasMatchingPairs}`);
      return hasTableStructure && hasMatchingPairs;
    case "Chronological Order":
      const isChronologicalOrder = (
        questionLines.some(line => line.includes("Arrange the following")) &&
        questionLines.some(line => line.includes("chronological order"))
      );
      console.log(`Chronological Order validation: ${isChronologicalOrder}`);
      return isChronologicalOrder;
    case "Direct Question with Single Correct Answer":
      const isDirectQuestion = !(
        questionLines.some(line => /^\d+\./.test(line)) ||
        questionLines.some(line => line.startsWith("Assertion (A):")) ||
        questionLines.some(line => line.includes("    ")) ||
        questionLines.some(line => line.includes("Arrange the following"))
      );
      console.log(`Direct Question validation: ${isDirectQuestion}`);
      return isDirectQuestion;
    default:
      console.log(`Unknown structure: ${selectedStructure}`);
      return false;
  }
};

// Function to wait for a run to complete
const waitForRunToComplete = async (threadId, runId) => {
  while (true) {
    const runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
    console.log(`⏳ AI Status: ${runStatus.status}`);

    if (runStatus.status === "completed" || runStatus.status === "failed") {
      return runStatus.status;
    }

    // Increase polling interval to reduce log frequency
    await new Promise(resolve => setTimeout(resolve, 2000)); // Poll every 2 seconds instead of 1
  }
};

app.post("/ask", async (req, res) => {
  try {
    const { query, category, userId } = req.body;
    console.log(`🔹 Received Query from User ${userId}: ${query}`);

    // Validate category
    if (!categoryToBookMap[category]) {
      throw new Error(`Invalid category: ${category}. Please provide a valid subject category.`);
    }

    const bookInfo = categoryToBookMap[category];
    const fileId = bookInfo.fileId;

    // Check if the file ID is valid for processing
    if (!fileId || fileId === "pending" || fileId.startsWith("[TBD")) {
      throw new Error(
        `File for category ${category} is not available (File ID: ${fileId}). MCQs cannot be generated.`
      );
    }

    let threadId = userThreads.get(userId);
    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      userThreads.set(userId, threadId);
      console.log(`✅ New Thread Created for User ${userId}: ${threadId}`);
    } else {
      console.log(`✅ Using Existing Thread for User ${userId}: ${threadId}`);
    }

    // Explicitly select the MCQ structure using random number
    const structureIndex = Math.floor(Math.random() * 7) + 1; // Random number between 1 and 7
    let selectedStructure;
    switch (structureIndex) {
      case 1:
        selectedStructure = "Statement-Based";
        break;
      case 2:
        selectedStructure = "Assertion-Reason";
        break;
      case 3:
        selectedStructure = "Matching Type";
        break;
      case 4:
        selectedStructure = "Multiple Statements with Specific Combinations";
        break;
      case 5:
        selectedStructure = "Chronological Order";
        break;
      case 6:
        selectedStructure = "Correctly Matched Pairs";
        break;
      case 7:
        selectedStructure = "Direct Question with Single Correct Answer";
        break;
      default:
        selectedStructure = "Statement-Based"; // Fallback
    }
    console.log(`🔸 Selected MCQ Structure: ${selectedStructure}`);

    // Construct structure-specific prompt
    let structurePrompt = "";
    switch (selectedStructure) {
      case "Statement-Based":
        structurePrompt = `
          You MUST generate the MCQ in the Statement-Based format with 3 numbered statements followed by "How many of the above statements are correct?"  
          Provide exactly 4 options:  
          (a) Only one  
          (b) Only two  
          (c) All three  
          (d) None  
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
        `;
        break;
      case "Assertion-Reason":
        structurePrompt = `
          You MUST generate the MCQ in the Assertion-Reason format with two statements labeled "Assertion (A)" and "Reason (R)".  
          Provide exactly 4 options:  
          (a) Both A and R are true, and R is the correct explanation of A  
          (b) Both A and R are true, but R is NOT the correct explanation of A  
          (c) A is true, but R is false  
          (d) A is false, but R is true  
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
        `;
        break;
      case "Matching Type":
        structurePrompt = `
          You MUST generate the MCQ in the Matching Type format with a table-like structure where the user must match items from two columns. The table MUST have exactly 4 pairs to match (A to D and 1 to 4). Use multiple spaces (at least 2 spaces) between the two columns to create a table-like appearance.  
          The question MUST start with "Match the following" and end with "Select the correct answer using the codes:".  
          Provide exactly 4 options:  
          (a) A-2, B-1, C-3, D-4  
          (b) A-1, B-2, C-4, D-3  
          (c) A-2, B-1, C-4, D-3  
          (d) A-3, B-2, C-1, D-4  
          DO NOT generate the MCQ in any other format, such as Statement-Based or Assertion-Reason.  
          Example:  
          Question: Match the following parliamentary committees with their functions:  
          Parliamentary Committee    Function  
          (A) Estimates Committee       (1) Reviews and reports on the accounts of the government  
          (B) Public Accounts Committee (2) Examines the demands for grants  
          (C) Committee on Public Undertakings (3) Investigates the working of public sector undertakings  
          (D) Committee on Delegated Legislation (4) Oversees the rules framed by the government  
          Select the correct answer using the codes:  
          Options:  
          (a) A-2, B-1, C-3, D-4  
          (b) A-1, B-2, C-4, D-3  
          (c) A-3, B-2, C-1, D-4  
          (d) A-4, B-3, C-2, D-1  
          Correct Answer: (a)  
          Explanation: The Estimates Committee examines the demands for grants (A-2), the Public Accounts Committee reviews the accounts of the government (B-1), the Committee on Public Undertakings investigates the working of public sector undertakings (C-3), and the Committee on Delegated Legislation oversees the rules framed by the government (D-4).
        `;
        break;
      case "Multiple Statements with Specific Combinations":
        structurePrompt = `
          You MUST generate the MCQ in the Multiple Statements with Specific Combinations format with 3 numbered statements followed by options specifying combinations.  
          Provide exactly 4 options:  
          (a) 1 and 2 only  
          (b) 2 and 3 only  
          (c) 1 and 3 only  
          (d) 1, 2, and 3  
          DO NOT generate the MCQ in any other format, such as Statement-Based with "How many of the above statements are correct?" or Assertion-Reason.  
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
        `;
        break;
      case "Chronological Order":
        structurePrompt = `
          You MUST generate the MCQ in the Chronological Order format with a list of 4 events or items to be arranged in chronological order. The question MUST start with "Arrange the following events in chronological order:".  
          Provide exactly 4 options:  
          (a) 1, 2, 3, 4  
          (b) 2, 1, 3, 4  
          (c) 1, 3, 2, 4  
          (d) 3, 2, 1, 4  
          DO NOT generate the MCQ in any other format, such as Statement-Based or Assertion-Reason.  
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
        `;
        break;
      case "Correctly Matched Pairs":
        structurePrompt = `
                  You MUST generate the MCQ in the Correctly Matched Pairs format with a list of 3 pairs (e.g., Festival    State) followed by a question asking which pairs are correctly matched. The list MUST be formatted as a table-like structure with multiple spaces (at least 2 spaces) between the two columns. The question MUST start with "Consider the following pairs:".  
          Provide exactly 4 options:  
          (a) A only  
          (b) A and B only  
          (c) B and C only  
          (d) A, B, and C  
          DO NOT generate the MCQ in any other format, such as Statement-Based or Assertion-Reason.  
          Example:  
          Question: Consider the following pairs:  
          Festival    State  
          (A) Chapchar Kut    Nagaland  
          (B) Wangala    Meghalaya  
          (C) Losar    Arunachal Pradesh  
          Which of the pairs are correctly matched?  
          Options:  
          (a) A only  
          (b) A and B only  
          (c) B and C only  
          (d) A, B, and C  
          Correct Answer: (c)  
          Explanation: Chapchar Kut is a festival of Mizoram, not Nagaland, so (A) is incorrect. Wangala is correctly matched with Meghalaya, and Losar is correctly matched with Arunachal Pradesh. Thus, only B and C are correctly matched.
        `;
        break;
      case "Direct Question with Single Correct Answer":
        structurePrompt = `
          You MUST generate the MCQ in the Direct Question with Single Correct Answer format with a single question and four options, where one is correct.  
          Provide exactly 4 options:  
          (a) [Option A]  
          (b) [Option B]  
          (c) [Option C]  
          (d) [Option D]  
          DO NOT generate the MCQ in any other format, such as Statement-Based or Assertion-Reason.  
          Example:  
          Question: Which one of the following is a tributary of the Brahmaputra?  
          Options:  
          (a) Gandak  
          (b) Kosi  
          (c) Subansiri  
          (d) Yamuna  
          Correct Answer: (c)  
          Explanation: The Subansiri is a major tributary of the Brahmaputra, joining it in Assam. The Gandak and Kosi are tributaries of the Ganga, and the Yamuna is a tributary of the Ganga as well.
        `;
        break;
    }

    const generalInstruction = `
      You are an AI trained exclusively on UPSC Books for the TrainWithMe platform.

      📚 Reference Book for This Query:  
      - Category: ${category}  
      - Book: ${bookInfo.bookName}  
      - File ID: ${fileId}  
      - Description: ${bookInfo.description}  

      **Instructions for MCQ Generation:**  
      - Generate 1 MCQ from the specified book (${bookInfo.bookName}) and chapter (or the entire book if no chapter is specified) using the attached file (File ID: ${fileId}).  
      - The MCQ MUST be generated in the ${selectedStructure} format as specified below.  
      - DO NOT generate the MCQ in any other format (e.g., do not use Statement-Based format if the selected structure is Matching Type).  
      - Ensure the MCQ is difficult but do not mention this in the response.  
      ${structurePrompt}

      **Response Structure for MCQs:**  
      - Use this EXACT structure for the response with PLAIN TEXT headers:  
        Question: [Full question text including statements, A/R, matching lists, etc.]  
        Options:  
        (a) [Option A]  
        (b) [Option B]  
        (c) [Option C]  
        (d) [Option D]  
        Correct Answer: [Correct option letter, e.g., (a)]  
        Explanation: [Brief explanation, 2-3 sentences, based on the requested book]  
      - Separate each section with EXACTLY TWO newlines (\n\n).  
      - Start the response directly with "Question:"—do NOT include any introductory text.  
      - Use plain text headers ("Question:", "Options:", "Correct Answer:", "Explanation:") without any formatting.  
      - For Matching Type and Correctly Matched Pairs questions, format the list as a simple text table with each pair on a new line (e.g., "(A) Item    (1) Match").  

      **Special Instructions for Specific Categories:**  
      - For "Science": Generate MCQs only from the Science section (Physics, Chemistry, Biology, Science & Technology) of the Disha IAS Previous Year Papers book (File ID: ${fileIds.Science}).  
      - For "CSAT": Generate MCQs only from the CSAT section of the Disha IAS Previous Year Papers book (File ID: ${fileIds.CSAT}).  
      - For "PreviousYearPaper": Generate MCQs from the entire Disha IAS Previous Year Papers book (File ID: ${fileIds.PreviousYearPaper}), covering all relevant sections.  
      - For "Atlas": Since the file is pending, respond with an error message: "File for Atlas is not available. MCQs cannot be generated at this time."  

      **Now, generate a response based on the book: "${bookInfo.bookName}" (File ID: ${fileId}):**  
      "${query}"
    `;

    let responseText = "";
    let retryCount = 0;
    const maxRetries = 2; // Reduced to 2 retries to minimize log accumulation

    while (retryCount <= maxRetries) {
      // Check for active runs and wait if necessary
      const runs = await openai.beta.threads.runs.list(threadId);
      const activeRun = runs.data.find(run => run.status === "in_progress" || run.status === "queued");
      if (activeRun) {
        console.log(`⏳ Waiting for active run ${activeRun.id} to complete...`);
        await waitForRunToComplete(threadId, activeRun.id);
      }

      await openai.beta.threads.messages.create(threadId, {
        role: "user",
        content: generalInstruction,
      });

      console.log("✅ Query Sent to AI");

      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: assistantId,
        tools: [{ type: "file_search" }],
      });

      if (!run || !run.id) {
        throw new Error("❌ Failed to create AI Run. Check OpenAI request.");
      }
      console.log(`🔄 AI is processing query (Run ID: ${run.id})`);

      const runStatus = await waitForRunToComplete(threadId, run.id);
      if (runStatus === "failed") {
        throw new Error("❌ AI request failed.");
      }

      const messages = await openai.beta.threads.messages.list(threadId);
      const latestMessage = messages.data.find(m => m.role === "assistant");
      responseText = latestMessage?.content[0]?.text?.value || "No response available.";
      console.log(`📜 AI Response: ${responseText}`);

      // Validate the response structure
      const isValidStructure = validateMCQStructure(responseText, selectedStructure);
      if (isValidStructure) {
        break; // Response matches the selected structure, proceed
      } else {
        console.log(`⚠️ Response does not match ${selectedStructure} structure, retrying (${retryCount + 1}/${maxRetries})...`);
        retryCount++;
        if (retryCount > maxRetries) {
          console.log(`⚠️ Falling back to Statement-Based structure after ${maxRetries} retries...`);
          selectedStructure = "Statement-Based";
          structurePrompt = `
            You MUST generate the MCQ in the Statement-Based format with 3 numbered statements followed by "How many of the above statements are correct?"  
            Provide exactly 4 options:  
            (a) Only one  
            (b) Only two  
            (c) All three  
            (d) None  
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
          `;
          retryCount = 0; // Reset retry count for fallback
          continue;
        }
      }
    }

    res.json({ answer: responseText });
    console.log("✅ AI Response Sent!");
  } catch (error) {
    console.error("❌ Error from OpenAI:", error);
    res.status(500).json({ error: "AI service error", details: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => console.log(`✅ Backend running on port ${PORT}`));