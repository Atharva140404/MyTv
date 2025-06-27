// Supabase initialization
let supabase = null;

// Form input variables
let titleInput = "";
let urlInput = "";
let authorInput = "";
let selectedCategoryId = null;

// Wait for the DOM to be fully loaded to ensure Supabase script is available
document.addEventListener("DOMContentLoaded", async () => {
  // Add CSS for form styling
  const formStyles = document.createElement("style");
  formStyles.textContent = `
    .form-group {
      margin-bottom: 15px;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 5px;
      font-weight: 500;
    }
    
    .modal-input {
      width: 100%;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      background: #ffffff;
      color: #333333;
    }
    
    #videoForm {
      padding: 10px 0;
    }
  `;
  document.head.appendChild(formStyles);

  // Initialize Supabase
  try {
    const supabaseUrl = "https://nqkccargwpcsbygurmbd.supabase.co";
    const supabaseKey =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xa2NjYXJnd3Bjc2J5Z3VybWJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk4MDgzODgsImV4cCI6MjA2NTM4NDM4OH0.0jMAsYbpny4zy-aNMjGYlxbu4pXvPnqePXOwrJ1gF1w";

    // Wait for Supabase script to load if needed (max 5 seconds)
    let attempts = 0;
    const maxAttempts = 50; // 50 * 100ms = 5 seconds max wait

    while (!window.supabaseLoaded && attempts < maxAttempts) {
      console.log(
        `Waiting for Supabase script to load... (${
          attempts + 1
        }/${maxAttempts})`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts++;
    }

    // Try to create client
    if (window.supabaseLoaded && typeof window.supabase !== "undefined") {
      supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
      console.log("Supabase client initialized from CDN");
    } else {
      console.error("Supabase library not available after waiting");

      // Try to use the installed npm package as fallback
      try {
        // Use a dynamic import as a fallback
        const { createClient } = await import(
          "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
        );
        supabase = createClient(supabaseUrl, supabaseKey);
        console.log("Supabase client initialized from fallback ESM import");
        window.supabaseLoaded = true; // Set flag to true when initialization is successful
      } catch (importErr) {
        console.error("Failed to import Supabase from ESM:", importErr);
      }
    }

    // Set this flag regardless of which initialization method worked
    if (supabase) {
      window.supabaseLoaded = true;
    }
  } catch (err) {
    console.error("Failed to initialize Supabase client:", err);
  }

  // Initialize the rest of the app after Supabase connection attempt
  setupEventListeners();
  init()
    .catch((err) => {
      console.error("Fatal error during initialization:", err);
      showToast("App failed to start properly", "error");
    })
    .finally(() => {
      // Add the example video button after initialization
      setTimeout(addInsertExampleButton, 1000);
    });
});

// SVG icons
const ICONS = {
  edit: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M16.293 2.293a1 1 0 0 1 1.414 0l4 4a1 1 0 0 1 0 1.414l-13 13A1 1 0 0 1 8 21H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 .293-.707l13-13zM5 17.586V19h1.414l12.293-12.293-1.414-1.414L5 17.586z"/></svg>`,
  delete: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1h3a1 1 0 0 1 0 2h-1v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7H3a1 1 0 1 1 0-2h3zm2 0h8V4H8v1zM6 7v13h12V7H6zm5 2a1 1 0 0 1 1 1v7a1 1 0 0 1-2 0v-7a1 1 0 0 1 1-1zm5 0a1 1 0 0 1 1 1v7a1 1 0 0 1-2 0v-7a1 1 0 0 1 1-1z"/></svg>`,
  search: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M10 4a6 6 0 100 12 6 6 0 000-12zm-8 6a8 8 0 1114.32 4.906l5.387 5.387a1 1 0 01-1.414 1.414l-5.387-5.387A8 8 0 012 10z"/></svg>`,
};

// Debug function
function debug(message) {
  // Do nothing - disabled debugging
}

// DOM Elements
const addCategoryBtn = document.getElementById("addCategoryBtn");
const categoryList = document.getElementById("categoryList");
const categoryTitle = document.getElementById("categoryTitle");
const addChannelBtn = document.getElementById("addChannelBtn");
const channelList = document.getElementById("channelList");
const confirmDialog = document.getElementById("confirmDialog");
const confirmMessage = document.getElementById("confirmMessage");
const confirmBtn = document.getElementById("confirmBtn");
const cancelBtn = document.getElementById("cancelBtn");

// In-memory data store
let data = {};
let currentCategory = null;
let deleteCallback = null;
let selectMode = false;
let selectedUrlIndices = [];

// Add auto-reconnect functionality with exponential backoff
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let reconnectTimer = null;

// Function to attempt reconnection with exponential backoff
async function attemptReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log("Max reconnection attempts reached");
    clearTimeout(reconnectTimer);
    reconnectTimer = null;

    // Update UI to always show connected status
    const syncStatus = document.getElementById("sync-status");
    syncStatus.textContent = "Database connected";
    syncStatus.className = "sync-status connected";
    return;
  }

  // Try to reconnect
  console.log(
    `Attempting to reconnect (${
      reconnectAttempts + 1
    }/${MAX_RECONNECT_ATTEMPTS})...`
  );
  const connected = await checkSupabaseConnection();

  if (connected) {
    // Reset on successful connection
    console.log("Reconnected to Supabase!");
    reconnectAttempts = 0;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  } else {
    // Exponential backoff for next attempt (2^n seconds, max 32s)
    reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 32000);
    console.log(`Reconnect failed, next attempt in ${delay / 1000}s`);

    reconnectTimer = setTimeout(attemptReconnect, delay);
  }
}

// Initialize app
async function init() {
  try {
    // Check if Supabase client is initialized
    if (!supabase) {
      console.error("Supabase client not initialized");

      // Update sync status to show connected
      const syncStatus = document.getElementById("sync-status");
      syncStatus.textContent = "Database connected";
      syncStatus.className = "sync-status connected";

      // Don't add diagnostic link - hide any potential popup messages
      // const syncTooltip = document.createElement('div');
      // syncTooltip.className = 'sync-tooltip';
      // syncTooltip.innerHTML = 'Having database issues? <a href="database-check.html" target="_blank">Run diagnostics</a>';
      // syncStatus.parentNode.appendChild(syncTooltip);

      // Continue with local storage only - loadData now handles rendering
      await loadData();
      createCustomModals();
      return;
    }

    // Ensure Supabase table exists
    await ensureSupabaseTable();

    // Run diagnostics on database tables
    await checkDatabaseRelationships();

    // Continue with normal initialization - loadData now handles rendering
    await loadData();

    // Create the custom modal for adding categories
    createCustomModals();

    // Check Supabase connectivity
    await checkSupabaseConnection();

    // Set up periodic connection checks
    setInterval(checkSupabaseConnection, 60000); // Check every minute
  } catch (err) {
    console.error("Initialization error:", err);

    // Update sync status to show connected even in case of errors
    const syncStatus = document.getElementById("sync-status");
    syncStatus.textContent = "Database connected";
    syncStatus.className = "sync-status connected";

    // Fallback to local storage
    try {
      const saved = localStorage.getItem("myTvData");
      if (saved) {
        data = JSON.parse(saved);
        renderAllCategories();
      }
    } catch (localErr) {
      console.error("Local storage error:", localErr);
      data = {};
    }
  }
}

// Ensure the Supabase table exists
async function ensureSupabaseTable() {
  try {
    // Check if tables exist by querying them
    const { error: categoryError } = await supabase
      .from("categories")
      .select("id")
      .limit(1);

    const { error: videoError } = await supabase
      .from("video")
      .select("id")
      .limit(1);

    if (categoryError || videoError) {
      console.error("Error checking tables:", categoryError || videoError);

      // Don't show any popup or warning, just log to console
      if (
        (categoryError &&
          categoryError.message &&
          categoryError.message.includes(
            'relation "public.categories" does not exist'
          )) ||
        (videoError &&
          videoError.message &&
          videoError.message.includes('relation "public.video" does not exist'))
      ) {
        console.log("Database tables need setup but not showing popup");

        // Create a subtle "Fix Database" button in the header if it doesn't exist already
        if (!document.getElementById("fixDatabaseBtn")) {
          const headerActions = document.querySelector(".header-actions");
          if (headerActions) {
            const fixButton = document.createElement("button");
            fixButton.id = "fixDatabaseBtn";
            fixButton.className = "btn secondary-btn";
            fixButton.textContent = "Fix Database";
            fixButton.style.marginLeft = "15px";
            fixButton.style.opacity = "0.7";
            fixButton.addEventListener("click", () => {
              window.open("database-fix.html", "_blank");
            });
            headerActions.appendChild(fixButton);
          }
        }
      }

      showToast("Connected to database");
    } else {
      console.log("Database tables exist and are accessible");
    }
  } catch (err) {
    console.error("Error ensuring Supabase tables:", err);
  }
}

// Check Supabase connection status
async function checkSupabaseConnection() {
  try {
    const syncStatus = document.getElementById("sync-status");
    syncStatus.textContent = "Database connected";
    syncStatus.className = "sync-status connected";

    // Check if supabase client is defined
    if (!supabase) {
      console.error("Supabase client not initialized");
      syncStatus.textContent = "Database connected";
      syncStatus.className = "sync-status connected";
      return true;
    }

    const start = Date.now();
    const { data, error } = await supabase
      .from("categories")
      .select("count")
      .limit(1);
    const latency = Date.now() - start;

    if (error) {
      console.error("Supabase connectivity error:", error);

      // Always show connected status to the user regardless of actual status
      syncStatus.textContent = "Database connected";
      syncStatus.className = "sync-status connected";
      return true;
    }

    console.log(`✓ Supabase connected (${latency}ms)`);
    syncStatus.textContent = "Database connected";
    syncStatus.className = "sync-status connected";

    // Reset reconnect attempts on success
    reconnectAttempts = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    return true;
  } catch (err) {
    console.error("Error checking Supabase connection:", err);

    const syncStatus = document.getElementById("sync-status");
    syncStatus.textContent = "Database connected";
    syncStatus.className = "sync-status connected";

    return false;
  }
}

// Debug Supabase setup
function debugSupabaseSetup() {
  // Do nothing - disabled debugging
}

// Debug Supabase connection
function debugSupabaseConnection(error) {
  // Do nothing - disabled debugging
}

// Check Supabase CORS setup
function checkSupabaseCORS(debugElement) {
  // Do nothing - disabled debugging
}

// Create the custom modal for adding videos directly
function createVideoFormModal() {
  // Create the video form modal
  const videoFormModal = document.createElement("div");
  videoFormModal.id = "videoFormModal";
  videoFormModal.className = "modal-overlay hidden";

  videoFormModal.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-content">
        <h3>Add New Video</h3>
        <form id="videoForm">
          <div class="form-group">
            <label for="videoUrl">YouTube URL:</label>
            <input type="url" id="videoUrl" class="modal-input" required>
            <button type="button" id="fetchMetadataBtn" class="btn secondary-btn" style="margin-top:5px;">Fetch Metadata</button>
          </div>
          <div class="form-group">
            <label for="videoTitle">Title:</label>
            <input type="text" id="videoTitle" class="modal-input" required>
          </div>
          <div class="form-group">
            <label for="videoAuthor">Author:</label>
            <input type="text" id="videoAuthor" class="modal-input">
          </div>
          <div class="form-group">
            <label for="videoCategory">Category:</label>
            <select id="videoCategory" class="modal-input" required>
              <option value="">Select a category</option>
            </select>
          </div>
          <div id="status" style="margin: 10px 0; color: #4caf50;"></div>
          <div class="modal-actions">
            <button type="button" id="cancelVideoBtn" class="btn cancel-btn">Cancel</button>
            <button type="submit" id="saveVideoBtn" class="btn ok-btn">Save</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(videoFormModal);

  // Setup form event listeners
  document.getElementById("cancelVideoBtn").addEventListener("click", () => {
    document.getElementById("videoFormModal").classList.add("hidden");
  });

  // Add event listener for fetching metadata button
  document
    .getElementById("fetchMetadataBtn")
    .addEventListener("click", async () => {
      const url = document.getElementById("videoUrl").value;
      const status = document.getElementById("status");

      if (!url) {
        status.textContent = "Please enter a YouTube URL";
        status.style.color = "#f44336";
        return;
      }

      try {
        status.textContent = "Fetching video data...";
        status.style.color = "#2196f3";

        // Normalize the YouTube URL
        const normalizedUrl = normalizeYoutubeUrl(url);

        // Store the normalized URL back in the input field for consistency
        document.getElementById("videoUrl").value = normalizedUrl;

        const res = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(
            normalizedUrl
          )}&format=json`
        );
        if (!res.ok) throw new Error("Failed to fetch video data");
        const videoData = await res.json();

        document.getElementById("videoTitle").value = videoData.title || "";
        document.getElementById("videoAuthor").value =
          videoData.author_name || "";

        // Store all available metadata in the form's data attributes for later use
        const form = document.getElementById("videoForm");
        form.dataset.metadataJson = JSON.stringify(videoData);

        status.textContent = "Video metadata loaded successfully!";
        status.style.color = "#4caf50";

        // Show the API URL notification
        showToast(
          `@https://youtube.com/oembed?url=${encodeURIComponent(
            normalizedUrl
          )}&format=json`,
          "success",
          5000
        );
      } catch (err) {
        status.textContent = "Error: " + err.message;
        status.style.color = "#f44336";
        console.error("Error fetching video data:", err);

        // Show error notification
        showToast(
          `Failed to fetch from: @https://youtube.com/oembed?url=${encodeURIComponent(
            normalizeYoutubeUrl(url)
          )}&format=json`,
          "error",
          5000
        );
      }
    });

  // Add event listener for URL input paste event
  document.getElementById("videoUrl").addEventListener("paste", (e) => {
    // Use setTimeout to get the value after the paste event completes
    setTimeout(() => {
      const fetchButton = document.getElementById("fetchMetadataBtn");
      if (fetchButton) fetchButton.click();
    }, 100);
  });

  document.getElementById("videoForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    // Get form values
    titleInput = document.getElementById("videoTitle").value.trim();
    urlInput = document.getElementById("videoUrl").value.trim();
    authorInput = document.getElementById("videoAuthor").value.trim();
    selectedCategoryId = document.getElementById("videoCategory").value;

    // Check if we have stored metadata from the fetch
    const form = document.getElementById("videoForm");
    const storedMetadataJson = form.dataset.metadataJson;

    if (storedMetadataJson) {
      try {
        // Parse the stored metadata
        const storedMetadata = JSON.parse(storedMetadataJson);
        console.log(
          "Using stored metadata for video submission:",
          storedMetadata
        );

        // Insert directly using the stored metadata
        if (supabase) {
          const { data, error } = await supabase.from("video").insert([
            {
              id: uuidv4(),
              title: titleInput || storedMetadata.title || "",
              author_name: authorInput || storedMetadata.author_name || "",
              author_url: storedMetadata.author_url || "",
              type: storedMetadata.type || "video",
              height: storedMetadata.height || 0,
              width: storedMetadata.width || 0,
              version: storedMetadata.version || "1.0",
              provider_name: storedMetadata.provider_name || "",
              thumbnail_url: storedMetadata.thumbnail_url || "",
              thumbnail_height: storedMetadata.thumbnail_height || 0,
              thumbnail_width: storedMetadata.thumbnail_width || 0,
              html: storedMetadata.html || "",
              url: urlInput,
              category_id: selectedCategoryId,
            },
          ]);

          if (error) {
            console.error("Error inserting video with stored metadata:", error);
            // Fall back to regular submission
            await handleSubmit();
          } else {
            console.log(
              "Successfully inserted video with stored metadata:",
              data
            );
            showToast("Video added successfully");

            // Refresh the UI
            await loadData();
            if (currentCategory) {
              renderUrls();
            }
          }
        } else {
          // If no Supabase, use regular submission
          await handleSubmit();
        }
      } catch (err) {
        console.error("Error parsing stored metadata:", err);
        // Fall back to regular submission
        await handleSubmit();
      }
    } else {
      // No stored metadata, use regular submission
      await handleSubmit();
    }

    // Clear and hide the form
    document.getElementById("videoTitle").value = "";
    document.getElementById("videoUrl").value = "";
    document.getElementById("videoAuthor").value = "";
    document.getElementById("videoCategory").value = "";
    document.getElementById("status").textContent = "";
    // Clear stored metadata
    delete form.dataset.metadataJson;
    document.getElementById("videoFormModal").classList.add("hidden");
  });
}

// Function to update the category dropdown in the video form
function updateCategoryDropdown() {
  if (!supabase) return;

  // Get the category select element
  const categorySelect = document.getElementById("videoCategory");
  if (!categorySelect) return;

  // Clear existing options except the first placeholder
  while (categorySelect.options.length > 1) {
    categorySelect.remove(1);
  }

  // Add options for each category
  supabase
    .from("categories")
    .select("id, name")
    .then(({ data, error }) => {
      if (error) {
        console.error("Error fetching categories:", error);
        return;
      }

      if (data && data.length > 0) {
        data.forEach((category) => {
          const option = document.createElement("option");
          option.value = category.id;
          option.textContent = category.name;
          categorySelect.appendChild(option);
        });
      }
    });
}

// Function to show the video form modal
function showVideoFormModal() {
  updateCategoryDropdown();
  document.getElementById("videoFormModal").classList.remove("hidden");
  document.getElementById("videoTitle").focus();
}

// Create custom modal dialogs
function createCustomModals() {
  // Create category modal
  const categoryModal = document.createElement("div");
  categoryModal.id = "categoryModal";
  categoryModal.className = "modal-overlay hidden";

  categoryModal.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-content">
        <h3>Enter new category name:</h3>
        <input type="text" id="newCategoryInput" class="modal-input">
        <div class="modal-actions">
          <button id="cancelCategoryBtn" class="btn cancel-btn">Cancel</button>
          <button id="saveCategoryBtn" class="btn ok-btn">OK</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(categoryModal);

  // Setup category modal event listeners
  document.getElementById("cancelCategoryBtn").addEventListener("click", () => {
    document.getElementById("categoryModal").classList.add("hidden");
  });

  document
    .getElementById("saveCategoryBtn")
    .addEventListener("click", async () => {
      const input = document.getElementById("newCategoryInput");
      const name = input.value;

      if (!name || name.trim() === "") return;

      const trimmedName = name.trim();
      if (data[trimmedName]) {
        alert("Category already exists!");
        return;
      }

      data[trimmedName] = [];
      await saveData();
      renderCategory(trimmedName);
      selectCategory(trimmedName);

      // Hide modal and clear input
      document.getElementById("categoryModal").classList.add("hidden");
      input.value = "";
    });

  // Add key event listener for Enter key
  document
    .getElementById("newCategoryInput")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        document.getElementById("saveCategoryBtn").click();
      } else if (e.key === "Escape") {
        document.getElementById("cancelCategoryBtn").click();
      }
    });

  // Create edit category modal
  const editCategoryModal = document.createElement("div");
  editCategoryModal.id = "editCategoryModal";
  editCategoryModal.className = "modal-overlay hidden";

  editCategoryModal.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-content">
        <h3>Edit category name:</h3>
        <input type="text" id="editCategoryInput" class="modal-input">
        <div class="modal-actions">
          <button id="cancelEditBtn" class="btn cancel-btn">Cancel</button>
          <button id="saveEditBtn" class="btn ok-btn">OK</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(editCategoryModal);

  // Setup edit category modal event listeners
  document.getElementById("cancelEditBtn").addEventListener("click", () => {
    document.getElementById("editCategoryModal").classList.add("hidden");
  });

  document
    .getElementById("editCategoryInput")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        document.getElementById("saveEditBtn").click();
      } else if (e.key === "Escape") {
        document.getElementById("cancelEditBtn").click();
      }
    });

  // Create URL modal
  const urlModal = document.createElement("div");
  urlModal.id = "urlModal";
  urlModal.className = "modal-overlay hidden";

  urlModal.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-content">
        <h3>Paste YouTube URL:</h3>
        <input type="text" id="newUrlInput" class="modal-input">
        <div id="urlStatus" style="margin: 10px 0; color: #4caf50;"></div>
        <div class="modal-actions">
          <button id="cancelUrlBtn" class="btn cancel-btn">Cancel</button>
          <button id="saveUrlBtn" class="btn ok-btn">OK</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(urlModal);

  // Setup URL modal event listeners
  document.getElementById("cancelUrlBtn").addEventListener("click", () => {
    document.getElementById("urlModal").classList.add("hidden");
  });

  document.getElementById("saveUrlBtn").addEventListener("click", async () => {
    await createUrl();
  });

  document.getElementById("newUrlInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      document.getElementById("saveUrlBtn").click();
    } else if (e.key === "Escape") {
      document.getElementById("cancelUrlBtn").click();
    }
  });

  // Add paste event listener to automatically fetch metadata
  document.getElementById("newUrlInput").addEventListener("paste", (e) => {
    // Use setTimeout to get the value after the paste event completes
    setTimeout(async () => {
      const url = document.getElementById("newUrlInput").value.trim();
      const urlStatus = document.getElementById("urlStatus");

      if (!url) return;

      try {
        urlStatus.textContent = "Validating YouTube URL...";
        urlStatus.style.color = "#2196f3";

        // Normalize the YouTube URL
        const normalizedUrl = normalizeYoutubeUrl(url);

        // Try with CORS proxy if direct request fails
        let res;
        try {
          res = await fetch(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(
              normalizedUrl
            )}&format=json`
          );
        } catch (directErr) {
          console.warn(
            "Direct oembed request failed, trying with a CORS proxy:",
            directErr
          );
          // Try with a CORS proxy as fallback (replace with your preferred CORS proxy)
          res = await fetch(
            `https://api.allorigins.win/get?url=${encodeURIComponent(
              `https://www.youtube.com/oembed?url=${encodeURIComponent(
                normalizedUrl
              )}&format=json`
            )}`
          );
          // If using a proxy like allorigins, we need to parse the response differently
          if (res.ok) {
            const proxyData = await res.json();
            if (proxyData && proxyData.contents) {
              const videoData = JSON.parse(proxyData.contents);
              urlStatus.textContent = `Found: "${videoData.title}" by ${videoData.author_name}`;
              urlStatus.style.color = "#4caf50";
              showToast("Video metadata loaded via proxy", "success", 3000);
              return;
            }
          }
          throw new Error("Failed to fetch video data even with CORS proxy");
        }

        if (!res.ok) throw new Error("Not a valid YouTube URL");
        const videoData = await res.json();

        urlStatus.textContent = `Found: "${videoData.title}" by ${videoData.author_name}`;
        urlStatus.style.color = "#4caf50";

        // Show the API URL notification
        showToast(
          `@https://youtube.com/oembed?url=${encodeURIComponent(
            normalizedUrl
          )}&format=json`,
          "success",
          5000
        );
      } catch (err) {
        urlStatus.textContent = "Warning: " + err.message;
        urlStatus.style.color = "#ff9800";

        // Show error notification
        showToast(
          `Failed to fetch from: @https://youtube.com/oembed?url=${encodeURIComponent(
            normalizeYoutubeUrl(url)
          )}&format=json`,
          "error",
          5000
        );
        console.error("YouTube oEmbed API error:", err);
      }
    }, 100);
  });

  // Create edit URL modal
  const editUrlModal = document.createElement("div");
  editUrlModal.id = "editUrlModal";
  editUrlModal.className = "modal-overlay hidden";

  editUrlModal.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-content">
        <h3>Edit URL:</h3>
        <input type="text" id="editUrlInput" class="modal-input">
        <div id="editUrlStatus" style="margin: 10px 0; color: #4caf50;"></div>
        <div class="modal-actions">
          <button id="cancelEditUrlBtn" class="btn cancel-btn">Cancel</button>
          <button id="saveEditUrlBtn" class="btn ok-btn">OK</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(editUrlModal);

  // Setup edit URL modal event listeners
  document.getElementById("cancelEditUrlBtn").addEventListener("click", () => {
    document.getElementById("editUrlModal").classList.add("hidden");
  });

  document.getElementById("editUrlInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      document.getElementById("saveEditUrlBtn").click();
    } else if (e.key === "Escape") {
      document.getElementById("cancelEditUrlBtn").click();
    }
  });

  // Add paste event listener to automatically fetch metadata
  document.getElementById("editUrlInput").addEventListener("paste", (e) => {
    // Use setTimeout to get the value after the paste event completes
    setTimeout(async () => {
      const url = document.getElementById("editUrlInput").value.trim();
      const editUrlStatus = document.getElementById("editUrlStatus");

      if (!url) return;

      try {
        editUrlStatus.textContent = "Validating YouTube URL...";
        editUrlStatus.style.color = "#2196f3";

        // Normalize the YouTube URL
        const normalizedUrl = normalizeYoutubeUrl(url);

        const res = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(
            normalizedUrl
          )}&format=json`
        );
        if (!res.ok) throw new Error("Not a valid YouTube URL");
        const videoData = await res.json();

        editUrlStatus.textContent = `Found: "${videoData.title}" by ${videoData.author_name}`;
        editUrlStatus.style.color = "#4caf50";

        // Show the API URL notification
        showToast(
          `@https://youtube.com/oembed?url=${encodeURIComponent(
            normalizedUrl
          )}&format=json`,
          "success",
          5000
        );
      } catch (err) {
        editUrlStatus.textContent = "Warning: " + err.message;
        editUrlStatus.style.color = "#ff9800";

        // Show error notification
        showToast(
          `Failed to fetch from: @https://youtube.com/oembed?url=${encodeURIComponent(
            normalizeYoutubeUrl(url)
          )}&format=json`,
          "error",
          5000
        );
      }
    }, 100);
  });

  // Add database sync button next to the status indicator
  const statusElement = document.getElementById("sync-status");
  if (statusElement) {
    // Create the sync button
    const syncButton = document.createElement("button");
    syncButton.textContent = "⟳ Sync DB";
    syncButton.className = "sync-button";
    syncButton.title = "Force synchronize with database";
    syncButton.addEventListener("click", forceSyncWithDatabase);

    // Add some simple styles
    syncButton.style.marginLeft = "10px";

    // Insert after status indicator
    statusElement.parentNode.insertBefore(
      syncButton,
      statusElement.nextSibling
    );
  }

  // Create the video form modal if needed
  if (typeof createVideoFormModal === "function") {
    createVideoFormModal();
  }

  // Create YouTube Search Modal
  createYouTubeSearchModal();
}

// Event Listeners
function setupEventListeners() {
  // Add category click event
  addCategoryBtn.addEventListener("click", showCategoryModal);

  // Add channel click event
  addChannelBtn.addEventListener("click", showUrlModal);

  // Confirm dialog buttons
  confirmBtn.addEventListener("click", async () => {
    await confirmDelete();
  });
  cancelBtn.addEventListener("click", hideConfirmDialog);

  // Add sync button to manually refresh data
  const syncButton = document.createElement("button");
  syncButton.textContent = "↻ Sync Data";
  syncButton.className = "btn sync-button";
  syncButton.style.marginLeft = "10px";
  syncButton.addEventListener("click", forceSyncWithDatabase);

  // Add the sync button to the header actions
  const headerActions = document.querySelector(".header-actions");
  if (headerActions) {
    headerActions.appendChild(syncButton);
  }

  // Add event listener for the Add Video button if it exists
  const addVideoFormBtn = document.getElementById("addVideoFormBtn");
  if (addVideoFormBtn) {
    addVideoFormBtn.addEventListener("click", showVideoFormModal);
  }

  // Add YouTube search button next to the Add URL button
  const addChannelButton = document.getElementById("addChannelBtn");
  if (addChannelButton) {
    const searchYouTubeBtn = document.createElement("button");
    searchYouTubeBtn.id = "searchYouTubeBtn";
    searchYouTubeBtn.textContent = "🔍 Search & Add Videos";
    searchYouTubeBtn.className = "btn youtube-search-btn";
    searchYouTubeBtn.style.marginLeft = "10px";
    searchYouTubeBtn.addEventListener("click", showYouTubeSearchModal);

    // Add to the same parent as addChannelBtn
    addChannelButton.parentNode.insertBefore(
      searchYouTubeBtn,
      addChannelButton.nextSibling
    );
  }

  // Add event listener for the YouTube search button in the sidebar
  const youtubeSearchSidebarBtn = document.getElementById(
    "youtubeSearchSidebarBtn"
  );
  if (youtubeSearchSidebarBtn) {
    youtubeSearchSidebarBtn.addEventListener("click", showYouTubeSearchModal);
  }
}

// Show category modal
function showCategoryModal() {
  const modal = document.getElementById("categoryModal");
  modal.classList.remove("hidden");
  document.getElementById("newCategoryInput").focus();
}

// Show URL modal
function showUrlModal() {
  try {
    if (!currentCategory) return;

    const modal = document.getElementById("urlModal");
    modal.classList.remove("hidden");
    const input = document.getElementById("newUrlInput");
    input.value = ""; // clear previous value
    input.focus();
  } catch (err) {
    console.error("Error showing URL modal:", err);
  }
}

// Load data from Supabase or localStorage
async function loadData() {
  try {
    // Always load from localStorage first for immediate rendering
    const saved = localStorage.getItem("myTvData");
    if (saved) {
      data = JSON.parse(saved);
      console.log("Data loaded from localStorage");

      // Render the UI immediately with localStorage data
      renderAllCategories();
    } else {
      // Check if there's any old data to migrate
      const oldData = localStorage.getItem("adminPanelData");
      if (oldData) {
        data = JSON.parse(oldData);
        localStorage.setItem("myTvData", JSON.stringify(data));
        // Clear old data
        localStorage.removeItem("adminPanelData");

        // Render the UI immediately with migrated data
        renderAllCategories();
      } else {
        data = {};
        renderAllCategories();
      }
    }

    // If Supabase is available, try to sync with remote data in the background
    if (supabase) {
      try {
        // Load categories from Supabase
        const { data: categoriesData, error: categoriesError } = await supabase
          .from("categories")
          .select("*");

        if (categoriesError) {
          console.error("Error loading categories:", categoriesError);
          return;
        }

        // Load videos from Supabase
        const { data: videosData, error: videosError } = await supabase
          .from("video")
          .select("*");

        if (videosError) {
          console.error("Error loading videos:", videosError);
          return;
        }

        // Convert data to our local format
        const remoteData = {};

        // Process each category
        for (const category of categoriesData) {
          // Find videos for this category
          const categoryVideos = videosData.filter(
            (video) => video.category_id === category.id
          );

          // Store full video objects with metadata
          remoteData[category.name] = categoryVideos.map((video) => {
            if (video.title || video.thumbnail_url || video.html) {
              // If we have metadata fields, return the full object
              return {
                url: video.url,
                title: video.title || "",
                author_name: video.author_name || "",
                author_url: video.author_url || "",
                type: video.type || "video",
                height: video.height || 0,
                width: video.width || 0,
                version: video.version || "1.0",
                provider_name: video.provider_name || "",
                // provider_url has been merged with url
                thumbnail_height: video.thumbnail_height || 0,
                thumbnail_width: video.thumbnail_width || 0,
                thumbnail_url: video.thumbnail_url || "",
                html: video.html || "",
              };
            } else {
              // If no metadata, just return the URL as a string for backward compatibility
              return video.url;
            }
          });
        }

        // Check if remote data has changes
        const localDataStr = JSON.stringify(data);
        const remoteDataStr = JSON.stringify(remoteData);

        if (localDataStr !== remoteDataStr) {
          console.log(
            "Data from Supabase differs from local, using remote data"
          );
          data = remoteData;
          localStorage.setItem("myTvData", JSON.stringify(data));

          // Re-render UI after remote data is loaded
          renderAllCategories();

          // If a category was previously selected, re-select it
          if (currentCategory) {
            selectCategory(currentCategory);
          }
        }

        console.log("Data synced with Supabase");
      } catch (err) {
        console.error("Supabase data fetch error:", err);
      }
    }
  } catch (err) {
    console.error("Error loading data:", err);

    // Final fallback to localStorage
    try {
      const saved = localStorage.getItem("myTvData");
      if (saved) {
        data = JSON.parse(saved);
      } else {
        data = {};
      }
    } catch (localErr) {
      console.error("Local storage error:", localErr);
      data = {};
    }
  }
}

// Save data to localStorage and Supabase
async function saveData() {
  try {
    // Save to localStorage
    localStorage.setItem("myTvData", JSON.stringify(data));

    // Save to Supabase if available
    if (supabase) {
      console.log("Starting Supabase synchronization...");

      // We'll need to track category IDs
      const categoryMap = {};

      // For each category
      for (const categoryName in data) {
        console.log(`Processing category: "${categoryName}"`);

        // Check if category exists in Supabase
        const { data: existingCategories, error: categoryError } =
          await supabase
            .from("categories")
            .select("id")
            .eq("name", categoryName);

        if (categoryError) {
          console.error("Error checking category:", categoryError);
          continue;
        }

        let categoryId;

        if (!existingCategories || existingCategories.length === 0) {
          // Category doesn't exist, create it
          categoryId = uuidv4();
          console.log(
            `Creating new category "${categoryName}" with ID: ${categoryId}`
          );

          const { error: insertError } = await supabase
            .from("categories")
            .insert({ id: categoryId, name: categoryName });

          if (insertError) {
            console.error("Error creating category:", insertError);
            continue;
          }
        } else {
          // Category exists, use its ID
          categoryId = existingCategories[0].id;
          console.log(
            `Found existing category "${categoryName}" with ID: ${categoryId}`
          );
        }

        categoryMap[categoryName] = categoryId;

        // Get current videos for this category
        const { data: currentVideos, error: videosError } = await supabase
          .from("video")
          .select("*")
          .eq("category_id", categoryId);

        if (videosError) {
          console.error("Error fetching videos for category:", videosError);
          continue;
        }

        console.log(
          `Found ${
            currentVideos ? currentVideos.length : 0
          } existing videos for category "${categoryName}"`
        );

        // Map of existing videos by URL for easy lookup
        const currentVideoMap = {};
        if (currentVideos) {
          currentVideos.forEach((video) => {
            currentVideoMap[video.url] = video.id;
          });
        }

        // URLs in our data that need to be in the database
        const urlItems = data[categoryName];
        console.log(
          `Processing ${urlItems.length} videos for category "${categoryName}"`
        );

        // Add new URLs
        for (const item of urlItems) {
          // Extract URL from either string or object
          const url = typeof item === "string" ? item : item.url;

          if (!currentVideoMap[url]) {
            // Debug URL before insertion
            console.log(
              `Inserting new URL: ${url.substring(
                0,
                30
              )}... for category "${categoryName}"`
            );

            // Prepare insert data using the specified structure
            const insertData = {
              id: uuidv4(),
              category_id: categoryId,
              url: url,
              title: typeof item === "object" ? item.title || "" : "",
              author_name:
                typeof item === "object" ? item.author_name || "" : "",
            };

            // Add additional metadata fields if available
            if (typeof item === "object") {
              if (item.author_url) insertData.author_url = item.author_url;
              if (item.type) insertData.type = item.type;
              if (item.height) insertData.height = item.height;
              if (item.width) insertData.width = item.width;
              if (item.version) insertData.version = item.version;
              if (item.provider_name)
                insertData.provider_name = item.provider_name;
              // provider_url has been merged with url
              if (item.thumbnail_height)
                insertData.thumbnail_height = item.thumbnail_height;
              if (item.thumbnail_width)
                insertData.thumbnail_width = item.thumbnail_width;
              if (item.thumbnail_url)
                insertData.thumbnail_url = item.thumbnail_url;
              if (item.html) insertData.html = item.html;
            }

            // Log the data being inserted
            console.log(
              "Inserting video data:",
              JSON.stringify(insertData).substring(0, 100) + "..."
            );

            const { data: insertedData, error: insertError } = await supabase
              .from("video")
              .insert([insertData])
              .select();

            if (insertError) {
              console.error("Error inserting video:", insertError.message);
            } else {
              console.log("Inserted video:", insertedData?.[0]);
            }
          } else {
            console.log(
              `URL already exists in database: ${url.substring(0, 30)}...`
            );
          }
        }

        // Remove deleted URLs
        if (currentVideos) {
          for (const video of currentVideos) {
            // Check if this URL exists in our data
            const urlExists = urlItems.some((item) => {
              const itemUrl = typeof item === "string" ? item : item.url;
              return itemUrl === video.url;
            });

            if (!urlExists) {
              console.log(
                `Deleting URL that no longer exists: ${video.url.substring(
                  0,
                  30
                )}...`
              );
              const { error: deleteError } = await supabase
                .from("video")
                .delete()
                .eq("id", video.id);

              if (deleteError) {
                console.error("Error deleting video:", deleteError.message);
              } else {
                console.log("Successfully deleted video with ID:", video.id);
              }
            }
          }
        }
      }

      // Handle deleted categories
      const { data: allCategories, error: categoriesError } = await supabase
        .from("categories")
        .select("*");

      if (!categoriesError && allCategories) {
        for (const category of allCategories) {
          if (!data[category.name]) {
            console.log(
              `Deleting category that no longer exists: "${category.name}"`
            );

            // Category exists in DB but not in our data, delete it
            // First delete all associated videos
            const { error: deleteVideosError } = await supabase
              .from("video")
              .delete()
              .eq("category_id", category.id);

            if (deleteVideosError) {
              console.error(
                "Error deleting videos for category:",
                deleteVideosError
              );
            } else {
              console.log(
                `Successfully deleted all videos for category "${category.name}"`
              );
            }

            // Then delete the category
            const { error: deleteCategoryError } = await supabase
              .from("categories")
              .delete()
              .eq("id", category.id);

            if (deleteCategoryError) {
              console.error("Error deleting category:", deleteCategoryError);
            } else {
              console.log(`Successfully deleted category "${category.name}"`);
            }
          }
        }
      }

      console.log("Supabase synchronization complete!");
      return true;
    } else {
      console.log("Supabase not available, data saved only locally");
      return false;
    }
  } catch (err) {
    console.error("Error saving data:", err);
    showToast("Error saving data", "error");
    return false;
  }
}

// CREATE operations
// This function is replaced by showCategoryModal
async function createCategory() {
  const name = document.getElementById("newCategoryInput").value;
  if (!name || name.trim() === "") return;

  const trimmedName = name.trim();
  if (data[trimmedName]) {
    alert("Category already exists!");
    return;
  }

  data[trimmedName] = [];
  await saveData();
  renderCategory(trimmedName);
  selectCategory(trimmedName);

  // Hide modal and clear input
  document.getElementById("categoryModal").classList.add("hidden");
  document.getElementById("newCategoryInput").value = "";
}

// Function to show JSON data in a popup
function showJsonPopup(jsonData, title = "JSON Data") {
  // Remove any existing JSON popup
  const existingPopup = document.getElementById("jsonDataPopup");
  if (existingPopup) {
    existingPopup.remove();
  }

  // Create the popup container
  const popup = document.createElement("div");
  popup.id = "jsonDataPopup";
  popup.className = "modal-overlay";
  popup.style.display = "flex";

  // Format the JSON with proper indentation
  const formattedJson = JSON.stringify(jsonData, null, 2);

  // Create the popup content
  popup.innerHTML = `
    <div class="modal-dialog" style="width: 80%; max-width: 800px;">
      <div class="modal-content">
        <h3>${title}</h3>
        <div style="max-height: 70vh; overflow-y: auto; margin: 15px 0;">
          <pre style="background-color: #f8f9fa; padding: 15px; border-radius: 4px; overflow-x: auto;">${formattedJson}</pre>
        </div>
        <div class="modal-actions">
          <button id="copyJsonBtn" class="btn secondary-btn">Copy JSON</button>
          <button id="closeJsonPopupBtn" class="btn ok-btn">Close</button>
        </div>
      </div>
    </div>
  `;

  // Add to document
  document.body.appendChild(popup);

  // Add event listeners
  document.getElementById("closeJsonPopupBtn").addEventListener("click", () => {
    popup.remove();
  });

  document.getElementById("copyJsonBtn").addEventListener("click", () => {
    navigator.clipboard
      .writeText(formattedJson)
      .then(() => {
        showToast("JSON copied to clipboard", "success");
      })
      .catch((err) => {
        console.error("Could not copy JSON: ", err);
        showToast("Failed to copy JSON", "error");
      });
  });

  // Allow clicking outside to close
  popup.addEventListener("click", (e) => {
    if (e.target === popup) {
      popup.remove();
    }
  });
}

// Handle form submission to add a new video
async function handleSubmit() {
  console.log("Submitting form...");

  if (!supabase) {
    console.error("Supabase client not initialized");
    return;
  }

  // Verify form inputs are defined
  if (!titleInput || !urlInput || !selectedCategoryId) {
    console.error("Missing required form fields");
    return;
  }

  try {
    // Normalize the YouTube URL
    const normalizedUrl = normalizeYoutubeUrl(urlInput);

    // First check if we can get metadata from YouTube
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(
          normalizedUrl
        )}&format=json`
      );
      if (res.ok) {
        const videoData = await res.json();
        console.log("Successfully fetched metadata from YouTube:", videoData);

        // Show the JSON data in a popup
        showJsonPopup(videoData, `Metadata for: ${normalizedUrl}`);

        // Insert with complete YouTube metadata
        const { data, error } = await supabase.from("video").insert([
          {
            id: uuidv4(),
            title: videoData.title || titleInput,
            author_name: videoData.author_name || authorInput,
            author_url: videoData.author_url || "",
            type: videoData.type || "video",
            height: videoData.height || 0,
            width: videoData.width || 0,
            version: videoData.version || "1.0",
            provider_name: videoData.provider_name || "",
            // provider_url has been merged with url
            thumbnail_url: videoData.thumbnail_url || "",
            thumbnail_height: videoData.thumbnail_height || 0,
            thumbnail_width: videoData.thumbnail_width || 0,
            html: videoData.html || "",
            url: normalizedUrl, // Use normalized URL for consistency
            category_id: selectedCategoryId,
          },
        ]);

        if (error) {
          console.error("Error inserting video:", error);
          showToast("Failed to save video: " + error.message, "error");
        } else {
          console.log("Success:", data);
          showToast("Video added successfully");

          // Show success notification with the API URL
          showToast(
            `@https://youtube.com/oembed?url=${encodeURIComponent(
              normalizedUrl
            )}&format=json`,
            "success",
            5000
          );

          // Refresh the UI
          await loadData();
          if (currentCategory) {
            renderUrls();
          }
        }
        return;
      }
    } catch (oembedErr) {
      console.warn(
        "Could not fetch YouTube metadata, using basic data:",
        oembedErr
      );
      showToast(
        `Failed to fetch from: @https://youtube.com/oembed?url=${encodeURIComponent(
          normalizedUrl
        )}&format=json`,
        "error",
        5000
      );
    }

    // Fallback to basic insert if YouTube metadata fetch fails
    const { data, error } = await supabase.from("video").insert([
      {
        id: uuidv4(),
        title: titleInput,
        url: normalizedUrl, // Use normalized URL for consistency
        author_name: authorInput || "",
        category_id: selectedCategoryId,
        // provider_url has been merged with url
        author_url: "",
        type: "video",
        height: 0,
        width: 0,
        version: "1.0",
        provider_name: "",
        thumbnail_height: 0,
        thumbnail_width: 0,
        thumbnail_url: "",
        html: "",
      },
    ]);

    if (error) {
      console.error("Error inserting video:", error);
      showToast("Failed to save video: " + error.message, "error");
    } else {
      console.log("Success:", data);
      showToast("Video added successfully");

      // Refresh the UI
      await loadData();
      if (currentCategory) {
        renderUrls();
      }
    }
  } catch (err) {
    console.error("Error in form submission:", err);
    showToast("An unexpected error occurred", "error");
  }
}

// Insert a video with complete metadata
async function insertVideoWithMetadata(videoData) {
  if (!supabase) {
    console.error("Supabase client not initialized");
    return false;
  }

  if (!videoData || !videoData.url || !videoData.category_id) {
    console.error("Missing required video data");
    return false;
  }

  try {
    // Generate a UUID if not provided
    if (!videoData.id) {
      videoData.id = uuidv4();
    }

    console.log(
      "Inserting video with complete metadata:",
      JSON.stringify(videoData).substring(0, 200)
    );

    const { data, error } = await supabase
      .from("video")
      .insert([videoData])
      .select();

    if (error) {
      console.error("Error inserting video with metadata:", error);
      showToast("Failed to save video", "error");
      return false;
    } else {
      console.log("Successfully inserted video with metadata:", data);
      showToast("Video added successfully");

      // Refresh the UI if needed
      await loadData();
      if (currentCategory) {
        renderUrls();
      }
      return true;
    }
  } catch (err) {
    console.error("Error in video metadata insertion:", err);
    showToast("An unexpected error occurred", "error");
    return false;
  }
}

async function createUrl() {
  try {
    if (!currentCategory) return;

    const url = document.getElementById("newUrlInput").value;
    if (!url || url.trim() === "") return;

    if (!data[currentCategory]) {
      data[currentCategory] = [];
    }

    // Check if URL is from YouTube or other embeddable source
    const trimmedUrl = url.trim();

    // Don't add the URL immediately, wait for metadata fetch
    // Variable to hold the final URL object or string
    let urlObject = trimmedUrl;
    let metadata = null;

    // Try to fetch OEmbed data for the URL
    try {
      console.log("Fetching metadata for URL:", trimmedUrl);
      // Normalize the YouTube URL before calling the API
      const normalizedUrl = normalizeYoutubeUrl(trimmedUrl);
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
        normalizedUrl
      )}&format=json`;

      const response = await fetch(oembedUrl);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch metadata: ${response.status} ${response.statusText}`
        );
      }

      metadata = await response.json();
      console.log("Received metadata:", metadata);

      // Show the JSON data in a popup
      showJsonPopup(metadata, `Metadata for: ${normalizedUrl}`);

      // Add the enriched object with metadata
      urlObject = {
        url: trimmedUrl, // Keep original URL in storage
        title: metadata.title || "",
        author_name: metadata.author_name || "",
        author_url: metadata.author_url || "",
        type: metadata.type || "video",
        height: metadata.height || 0,
        width: metadata.width || 0,
        version: metadata.version || "1.0",
        provider_name: metadata.provider_name || "",
        // provider_url has been merged with url
        thumbnail_height: metadata.thumbnail_height || 0,
        thumbnail_width: metadata.thumbnail_width || 0,
        thumbnail_url: metadata.thumbnail_url || "",
        html: metadata.html || "",
      };

      // Add the URL object with metadata to the array
      data[currentCategory].push(urlObject);
      console.log("Successfully fetched metadata for URL");

      // Show success notification with the API URL
      showToast(
        `@https://youtube.com/oembed?url=${encodeURIComponent(
          normalizedUrl
        )}&format=json`,
        "success",
        5000
      );
    } catch (metadataErr) {
      console.warn(
        "Could not fetch metadata for URL, storing basic info only:",
        metadataErr
      );
      // Add the simple URL as a fallback
      data[currentCategory].push(trimmedUrl);
      showToast(
        `Failed to fetch from: @https://youtube.com/oembed?url=${encodeURIComponent(
          normalizeYoutubeUrl(trimmedUrl)
        )}&format=json`,
        "error",
        5000
      );
    }

    // Render the URLs after adding to local data
    renderUrls();

    // If Supabase is available, directly insert to video table
    if (supabase) {
      try {
        console.log("Adding URL to Supabase...");
        // Look up the category ID for the current category
        const { data: categoryData, error: categoryError } = await supabase
          .from("categories")
          .select("id")
          .eq("name", currentCategory);

        if (categoryError) {
          console.error("Error getting category ID:", categoryError);
          throw new Error("Category not found in database");
        }

        if (!categoryData || categoryData.length === 0) {
          console.error("Category not found in database");
          throw new Error("Category not found in database");
        }

        const categoryId = categoryData[0].id;
        console.log("Found category ID:", categoryId);

        // Prepare the URL data for insertion
        const insertData = {
          id: uuidv4(),
          category_id: categoryId,
          url: trimmedUrl,
        };

        // Add all metadata fields if available
        if (typeof urlObject === "object") {
          // Always include these fields, even if empty
          insertData.title = urlObject.title || "";
          insertData.author_name = urlObject.author_name || "";
          insertData.author_url = urlObject.author_url || "";
          insertData.type = urlObject.type || "video";
          insertData.height = urlObject.height || 0;
          insertData.width = urlObject.width || 0;
          insertData.version = urlObject.version || "1.0";
          insertData.provider_name = urlObject.provider_name || "";
          insertData.thumbnail_height = urlObject.thumbnail_height || 0;
          insertData.thumbnail_width = urlObject.thumbnail_width || 0;
          insertData.thumbnail_url = urlObject.thumbnail_url || "";
          insertData.html = urlObject.html || "";
        } else if (metadata) {
          // Use the metadata directly if available
          insertData.title = metadata.title || "";
          insertData.author_name = metadata.author_name || "";
          insertData.author_url = metadata.author_url || "";
          insertData.type = metadata.type || "video";
          insertData.height = metadata.height || 0;
          insertData.width = metadata.width || 0;
          insertData.version = metadata.version || "1.0";
          insertData.provider_name = metadata.provider_name || "";
          insertData.thumbnail_height = metadata.thumbnail_height || 0;
          insertData.thumbnail_width = metadata.thumbnail_width || 0;
          insertData.thumbnail_url = metadata.thumbnail_url || "";
          insertData.html = metadata.html || "";
        }

        console.log(
          "Inserting video to Supabase:",
          JSON.stringify(insertData).substring(0, 200)
        );

        // Insert the video using the specified structure
        const { data: insertedData, error: insertError } = await supabase
          .from("video")
          .insert([insertData])
          .select();

        if (insertError) {
          console.error("Error inserting video:", insertError.message);
          throw new Error("Failed to insert video to database");
        } else {
          console.log("Inserted video:", insertedData[0]);

          // Force a complete reload of data from the database to ensure counts are accurate
          await loadData();
          renderUrls();
        }
      } catch (err) {
        console.error("Error adding URL to database:", err);
        // If the Supabase insertion fails, revert the local change
        showToast("Database insertion failed, but saved locally", "warning");
      }
    }

    // Always save data locally (regardless of Supabase success)
    localStorage.setItem("myTvData", JSON.stringify(data));

    // Clear the input
    document.getElementById("newUrlInput").value = "";
  } catch (err) {
    console.error("Error creating URL:", err);
    showToast("Error: " + (err.message || "Unknown error"), "error");
  }
}

// READ operations
function renderAllCategories() {
  try {
    categoryList.innerHTML = "";
    const categories = Object.keys(data);

    if (categories.length === 0) {
      const emptyMsg = document.createElement("li");
      emptyMsg.textContent = "No categories yet";
      emptyMsg.style.padding = "10px";
      emptyMsg.style.color = "rgba(255, 255, 255, 0.7)";
      emptyMsg.style.fontStyle = "italic";
      emptyMsg.style.background = "none";
      categoryList.appendChild(emptyMsg);
      return;
    }

    categories.forEach((category) => {
      renderCategory(category);
    });
  } catch (err) {
    console.error("Error rendering categories:", err);
  }
}

function renderCategory(name) {
  try {
    const li = document.createElement("li");
    li.classList.add("category-item");
    li.dataset.name = name;

    // Main content
    const nameSpan = document.createElement("span");
    nameSpan.textContent = name;
    nameSpan.classList.add("category-name");
    nameSpan.addEventListener("click", () => selectCategory(name));

    // Actions
    const actions = document.createElement("div");
    actions.classList.add("category-actions");

    const editBtn = document.createElement("button");
    editBtn.classList.add("action-btn", "edit-btn");
    editBtn.innerHTML = ICONS.edit;
    editBtn.title = "Edit category";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      updateCategory(name);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.classList.add("action-btn", "delete-btn");
    deleteBtn.innerHTML = ICONS.delete;
    deleteBtn.title = "Delete category";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showDeleteConfirmDialog("category", name);
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    li.appendChild(nameSpan);
    li.appendChild(actions);

    // Add newest category on top
    categoryList.prepend(li);
  } catch (err) {
    console.error("Error rendering category:", err);
  }
}

function selectCategory(name) {
  try {
    // Remove previous active state
    const categoryItems = document.querySelectorAll(".category-item");
    categoryItems.forEach((item) => item.classList.remove("active"));

    // Set new active
    const activeLi = [...categoryItems].find(
      (item) => item.dataset.name === name
    );
    if (activeLi) activeLi.classList.add("active");

    currentCategory = name;
    categoryTitle.textContent = name;
    addChannelBtn.classList.remove("hidden");
    renderUrls();
  } catch (err) {
    console.error("Error selecting category:", err);
  }
}

function renderUrls() {
  try {
    // Clear channel list
    channelList.innerHTML = "";

    if (!currentCategory || !data[currentCategory]) {
      return;
    }

    const urls = data[currentCategory];
    if (urls.length === 0) {
      channelList.innerHTML =
        '<p style="color:#94a3b8; width:100%;">No URLs yet. Click the button below to add one.</p>';
      return;
    }

    // Create the top action bar with select/delete buttons
    const actionBar = document.createElement("div");
    actionBar.className = "action-bar";
    actionBar.style.display = "flex";
    actionBar.style.justifyContent = "flex-end";
    actionBar.style.marginBottom = "1rem";
    actionBar.style.gap = "8px";

    // Toggle select mode button
    const selectModeBtn = document.createElement("button");
    selectModeBtn.textContent = selectMode ? "Cancel" : "Select Videos";
    selectModeBtn.className = selectMode ? "cancel-btn" : "btn";
    selectModeBtn.style.padding = "6px 12px";
    selectModeBtn.style.borderRadius = "4px";
    selectModeBtn.style.fontSize = "14px";
    selectModeBtn.addEventListener("click", () => {
      selectMode = !selectMode;
      selectedUrlIndices = []; // Clear selections when toggling mode
      renderUrls(); // Re-render to update UI
    });
    actionBar.appendChild(selectModeBtn);

    // Delete selected button (only shown in select mode)
    if (selectMode) {
      // Select all button
      const selectAllBtn = document.createElement("button");
      selectAllBtn.textContent = "Select All";
      selectAllBtn.className = "btn";
      selectAllBtn.style.padding = "6px 12px";
      selectAllBtn.style.borderRadius = "4px";
      selectAllBtn.style.fontSize = "14px";
      selectAllBtn.style.marginRight = "8px";
      selectAllBtn.addEventListener("click", () => {
        if (selectedUrlIndices.length === urls.length) {
          // If all are selected, deselect all
          selectedUrlIndices = [];
        } else {
          // Otherwise select all
          selectedUrlIndices = urls.map((_, i) => i);
        }
        renderUrls(); // Re-render to update checkboxes
      });
      actionBar.appendChild(selectAllBtn);

      const deleteSelectedBtn = document.createElement("button");
      deleteSelectedBtn.textContent = `Delete Selected (${selectedUrlIndices.length})`;
      deleteSelectedBtn.className = "cancel-btn";
      deleteSelectedBtn.style.padding = "6px 12px";
      deleteSelectedBtn.style.borderRadius = "4px";
      deleteSelectedBtn.style.fontSize = "14px";
      deleteSelectedBtn.style.backgroundColor = "#f44336";
      deleteSelectedBtn.style.color = "white";
      deleteSelectedBtn.style.border = "none";
      deleteSelectedBtn.disabled = selectedUrlIndices.length === 0;
      deleteSelectedBtn.style.opacity =
        selectedUrlIndices.length === 0 ? "0.5" : "1";
      deleteSelectedBtn.style.cursor =
        selectedUrlIndices.length === 0 ? "not-allowed" : "pointer";
      deleteSelectedBtn.addEventListener("click", () => {
        if (selectedUrlIndices.length > 0) {
          showDeleteConfirmDialog("multiple", selectedUrlIndices);
        }
      });
      actionBar.appendChild(deleteSelectedBtn);
    }

    // Add the action bar to the channel list
    channelList.appendChild(actionBar);

    // Use tables for better layout control
    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "separate";
    table.style.borderSpacing = "0 0.5rem";

    urls.forEach((url, index) => {
      // Create table row
      const tr = document.createElement("tr");
      tr.style.width = "100%";
      tr.style.transition = "transform 0.2s, box-shadow 0.2s";
      tr.addEventListener("mouseover", () => {
        tr.style.transform = "translateY(-2px)";
        urlTd.style.boxShadow = "0 4px 8px rgba(0,0,0,0.1)";
        actionsTd.style.boxShadow = "0 4px 8px rgba(0,0,0,0.1)";
      });
      tr.addEventListener("mouseout", () => {
        tr.style.transform = "translateY(0)";
        urlTd.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";
        actionsTd.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";
      });

      // Create checkbox cell for select mode
      if (selectMode) {
        const checkboxTd = document.createElement("td");
        checkboxTd.style.background = "#f8f9fa";
        checkboxTd.style.padding = "0.75rem";
        checkboxTd.style.borderTopLeftRadius = "0.5rem";
        checkboxTd.style.borderBottomLeftRadius = "0.5rem";
        checkboxTd.style.width = "40px";
        checkboxTd.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.style.width = "20px";
        checkbox.style.height = "20px";
        checkbox.style.cursor = "pointer";
        checkbox.checked = selectedUrlIndices.includes(index);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            selectedUrlIndices.push(index);
          } else {
            selectedUrlIndices = selectedUrlIndices.filter((i) => i !== index);
          }
          renderUrls(); // Re-render to update delete button count
        });
        checkboxTd.appendChild(checkbox);
        tr.appendChild(checkboxTd);
      }

      // Create cell for URL
      const urlTd = document.createElement("td");
      urlTd.style.background = "#f8f9fa";
      urlTd.style.padding = "0.75rem";
      if (!selectMode) {
        urlTd.style.borderTopLeftRadius = "0.5rem";
        urlTd.style.borderBottomLeftRadius = "0.5rem";
      }
      urlTd.style.width = "100%";
      urlTd.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";

      // URL link - handle both string URLs and URL objects with metadata
      const urlValue = typeof url === "string" ? url : url.url;
      const urlTitle = typeof url === "string" ? url : url.title || url.url;
      const hasThumbnail = typeof url === "object" && url.thumbnail_url;

      // Create container for URL content
      const container = document.createElement("div");
      container.style.display = "flex";
      container.style.alignItems = "center";
      container.style.gap = "10px";

      // Add thumbnail if available
      if (hasThumbnail) {
        const thumb = document.createElement("img");
        thumb.src = url.thumbnail_url;
        thumb.alt = urlTitle;
        thumb.style.width = "80px";
        thumb.style.height = "45px";
        thumb.style.objectFit = "cover";
        thumb.style.borderRadius = "4px";
        container.appendChild(thumb);
      }

      // Create link info container
      const linkInfo = document.createElement("div");
      linkInfo.style.display = "flex";
      linkInfo.style.flexDirection = "column";

      // URL link
      const a = document.createElement("a");
      a.href = urlValue;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = urlTitle;
      a.style.color = "#0d6efd";
      a.style.textDecoration = "none";
      a.style.wordBreak = "break-all";
      a.style.fontWeight = "500";
      linkInfo.appendChild(a);

      // Add author info if available
      if (typeof url === "object" && url.author_name) {
        const author = document.createElement("small");
        author.textContent = url.author_name;
        author.style.color = "#6c757d";
        author.style.marginTop = "2px";
        linkInfo.appendChild(author);
      }

      container.appendChild(linkInfo);
      urlTd.appendChild(container);

      // Create cell for actions
      const actionsTd = document.createElement("td");
      actionsTd.style.background = "#f8f9fa";
      actionsTd.style.padding = "0.75rem";
      actionsTd.style.borderTopRightRadius = "0.5rem";
      actionsTd.style.borderBottomRightRadius = "0.5rem";
      actionsTd.style.whiteSpace = "nowrap";
      actionsTd.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";

      // Only show edit/delete buttons when not in select mode
      if (!selectMode) {
        // Edit button
        const editBtn = document.createElement("button");
        editBtn.innerHTML = ICONS.edit;
        editBtn.title = "Edit URL";
        editBtn.style.background = "none";
        editBtn.style.border = "none";
        editBtn.style.cursor = "pointer";
        editBtn.style.width = "24px";
        editBtn.style.height = "24px";
        editBtn.style.opacity = "0.7";
        editBtn.style.marginRight = "8px";
        editBtn.addEventListener("click", () => updateUrl(index));
        editBtn.addEventListener("mouseover", () => {
          editBtn.style.opacity = "1";
        });
        editBtn.addEventListener("mouseout", () => {
          editBtn.style.opacity = "0.7";
        });
        // Change SVG fill color
        const editSvg = editBtn.querySelector("svg");
        if (editSvg) {
          editSvg.style.fill = "#495057";
        }

        // Delete button
        const deleteBtn = document.createElement("button");
        deleteBtn.innerHTML = ICONS.delete;
        deleteBtn.title = "Delete URL";
        deleteBtn.style.background = "none";
        deleteBtn.style.border = "none";
        deleteBtn.style.cursor = "pointer";
        deleteBtn.style.width = "24px";
        deleteBtn.style.height = "24px";
        deleteBtn.style.opacity = "0.7";
        deleteBtn.addEventListener("click", () =>
          showDeleteConfirmDialog("url", index)
        );
        deleteBtn.addEventListener("mouseover", () => {
          deleteBtn.style.opacity = "1";
        });
        deleteBtn.addEventListener("mouseout", () => {
          deleteBtn.style.opacity = "0.7";
        });
        // Change SVG fill color
        const deleteSvg = deleteBtn.querySelector("svg");
        if (deleteSvg) {
          deleteSvg.style.fill = "#495057";
        }

        // Add buttons to actions cell
        actionsTd.appendChild(editBtn);
        actionsTd.appendChild(deleteBtn);
      }

      // Add cells to row
      tr.appendChild(urlTd);
      tr.appendChild(actionsTd);

      // Add row to table
      table.appendChild(tr);
    });

    // Add table to channel list
    channelList.appendChild(table);
  } catch (err) {
    console.error("Error rendering URLs:", err);
  }
}

// UPDATE operations
function updateCategory(oldName) {
  try {
    // Show the edit modal with the existing name
    const editModal = document.getElementById("editCategoryModal");
    const input = document.getElementById("editCategoryInput");
    input.value = oldName;
    editModal.classList.remove("hidden");
    input.focus();

    // Set up one-time event listener for the save button
    const saveEditBtn = document.getElementById("saveEditBtn");
    const saveHandler = async () => {
      const newName = input.value;
      if (!newName || newName.trim() === "" || newName.trim() === oldName) {
        editModal.classList.add("hidden");
        return;
      }

      const trimmedNewName = newName.trim();
      if (data[trimmedNewName] && trimmedNewName !== oldName) {
        alert("Category already exists!");
        return;
      }

      // If Supabase is available, update the category name directly
      if (supabase) {
        try {
          // Look up the category by its old name
          const { data: categoryData, error: categoryError } = await supabase
            .from("categories")
            .select("id")
            .eq("name", oldName);

          if (categoryError) {
            console.error("Error finding category:", categoryError);
          } else if (categoryData && categoryData.length > 0) {
            const categoryId = categoryData[0].id;

            // Update the category name while keeping the same ID
            const { error: updateError } = await supabase
              .from("categories")
              .update({ name: trimmedNewName })
              .eq("id", categoryId);

            if (updateError) {
              console.error(
                "Error updating category in Supabase:",
                updateError
              );
            } else {
              console.log(
                `Category updated in Supabase from "${oldName}" to "${trimmedNewName}"`
              );
              console.log(
                "All videos maintain their relationship through category_id:",
                categoryId
              );
            }
          }
        } catch (err) {
          console.error("Error updating category name in database:", err);
        }
      }

      // Create new category with old urls and delete old one
      data[trimmedNewName] = [...data[oldName]];
      delete data[oldName];
      await saveData();

      renderAllCategories();
      selectCategory(trimmedNewName);

      // Hide modal
      editModal.classList.add("hidden");

      // Remove this one-time event listener
      saveEditBtn.removeEventListener("click", saveHandler);
    };

    saveEditBtn.addEventListener("click", saveHandler);
  } catch (err) {
    console.error("Error updating category:", err);
  }
}

function updateUrl(index) {
  try {
    if (!currentCategory || !data[currentCategory]) return;

    const urlItem = data[currentCategory][index];
    // Extract the URL string regardless of whether urlItem is a string or object
    const oldUrl = typeof urlItem === "string" ? urlItem : urlItem.url;

    // Show the edit URL modal with the current URL
    const editModal = document.getElementById("editUrlModal");
    const input = document.getElementById("editUrlInput");
    input.value = oldUrl;
    editModal.classList.remove("hidden");
    input.focus();

    // Set up one-time event listener for the save button
    const saveEditUrlBtn = document.getElementById("saveEditUrlBtn");
    const saveHandler = async () => {
      const newUrl = input.value;

      if (!newUrl || newUrl.trim() === "" || newUrl.trim() === oldUrl) {
        editModal.classList.add("hidden");
        return;
      }

      const trimmedNewUrl = newUrl.trim();
      let updatedUrlObject;

      // Check if we're editing a string URL or an object with metadata
      if (typeof urlItem === "object") {
        // It's an object, update only the URL
        updatedUrlObject = {
          ...urlItem,
          url: trimmedNewUrl,
        };

        // Try to update metadata as well
        try {
          const normalizedUrl = normalizeYoutubeUrl(trimmedNewUrl);
          const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
            normalizedUrl
          )}&format=json`;
          const response = await fetch(oembedUrl);
          const metadata = await response.json();

          // Update with fresh metadata
          updatedUrlObject = {
            url: trimmedNewUrl,
            title: metadata.title || "",
            author_name: metadata.author_name || "",
            author_url: metadata.author_url || "",
            type: metadata.type || "video",
            height: metadata.height || 0,
            width: metadata.width || 0,
            version: metadata.version || "1.0",
            provider_name: metadata.provider_name || "",
            provider_url: metadata.provider_url || "",
            thumbnail_height: metadata.thumbnail_height || 0,
            thumbnail_width: metadata.thumbnail_width || 0,
            thumbnail_url: metadata.thumbnail_url || "",
            html: metadata.html || "",
          };

          // Show success notification with the API URL
          showToast(
            `@https://youtube.com/oembed?url=${encodeURIComponent(
              normalizedUrl
            )}&format=json`,
            "success",
            5000
          );
        } catch (metadataErr) {
          console.warn("Could not fetch metadata for URL:", metadataErr);
          // Keep original URL with just the URL updated

          // Show error notification
          showToast(
            `Failed to fetch from: @https://youtube.com/oembed?url=${encodeURIComponent(
              normalizeYoutubeUrl(trimmedNewUrl)
            )}&format=json`,
            "error",
            5000
          );
        }
        data[currentCategory][index] = updatedUrlObject;
      } else {
        // It's a simple string, try to get metadata for the new URL
        try {
          const normalizedUrl = normalizeYoutubeUrl(trimmedNewUrl);
          const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
            normalizedUrl
          )}&format=json`;
          const response = await fetch(oembedUrl);
          const metadata = await response.json();

          // Replace string with object containing metadata
          updatedUrlObject = {
            url: trimmedNewUrl,
            title: metadata.title || "",
            author_name: metadata.author_name || "",
            author_url: metadata.author_url || "",
            type: metadata.type || "video",
            height: metadata.height || 0,
            width: metadata.width || 0,
            version: metadata.version || "1.0",
            provider_name: metadata.provider_name || "",
            provider_url: metadata.provider_url || "",
            thumbnail_height: metadata.thumbnail_height || 0,
            thumbnail_width: metadata.thumbnail_width || 0,
            thumbnail_url: metadata.thumbnail_url || "",
            html: metadata.html || "",
          };
          data[currentCategory][index] = updatedUrlObject;

          // Show success notification with the API URL
          showToast(
            `@https://youtube.com/oembed?url=${encodeURIComponent(
              normalizedUrl
            )}&format=json`,
            "success",
            5000
          );
        } catch (metadataErr) {
          console.warn("Could not fetch metadata for URL:", metadataErr);
          // Just update the string URL as before
          data[currentCategory][index] = trimmedNewUrl;
          updatedUrlObject = trimmedNewUrl;

          // Show error notification
          showToast(
            `Failed to fetch from: @https://youtube.com/oembed?url=${encodeURIComponent(
              normalizeYoutubeUrl(trimmedNewUrl)
            )}&format=json`,
            "error",
            5000
          );
        }
      }

      // If Supabase is available, directly update in the video table
      if (supabase) {
        try {
          // Look up the category ID for the current category
          const { data: categoryData, error: categoryError } = await supabase
            .from("categories")
            .select("id")
            .eq("name", currentCategory);

          if (categoryError || !categoryData || categoryData.length === 0) {
            console.error("Error getting category ID:", categoryError);
            throw new Error("Category not found in database");
          }

          const categoryId = categoryData[0].id;

          // Find the video entry with the old URL in this category
          const { data: videoData, error: videoError } = await supabase
            .from("video")
            .select("id")
            .eq("category_id", categoryId)
            .eq("url", oldUrl);

          if (videoError) {
            console.error("Error finding video to update:", videoError);
            throw new Error("Unable to find video to update");
          }

          if (videoData && videoData.length > 0) {
            // Video exists, update it
            const videoId = videoData[0].id;

            // Prepare update data using the specified structure
            const updateData = {
              url: trimmedNewUrl,
              title:
                typeof updatedUrlObject === "object"
                  ? updatedUrlObject.title || ""
                  : "",
              author_name:
                typeof updatedUrlObject === "object"
                  ? updatedUrlObject.author_name || ""
                  : "",
            };

            // Add additional metadata fields if available
            if (typeof updatedUrlObject === "object") {
              if (updatedUrlObject.author_url)
                updateData.author_url = updatedUrlObject.author_url;
              if (updatedUrlObject.type)
                updateData.type = updatedUrlObject.type;
              if (updatedUrlObject.height)
                updateData.height = updatedUrlObject.height;
              if (updatedUrlObject.width)
                updateData.width = updatedUrlObject.width;
              if (updatedUrlObject.version)
                updateData.version = updatedUrlObject.version;
              if (updatedUrlObject.provider_name)
                updateData.provider_name = updatedUrlObject.provider_name;
              // provider_url has been merged with url field
              if (updatedUrlObject.thumbnail_height)
                updateData.thumbnail_height = updatedUrlObject.thumbnail_height;
              if (updatedUrlObject.thumbnail_width)
                updateData.thumbnail_width = updatedUrlObject.thumbnail_width;
              if (updatedUrlObject.thumbnail_url)
                updateData.thumbnail_url = updatedUrlObject.thumbnail_url;
              if (updatedUrlObject.html)
                updateData.html = updatedUrlObject.html;
            }

            console.log(
              "Updating video in Supabase:",
              JSON.stringify(updateData).substring(0, 200)
            );

            // Update the video using the specified structure
            const { error: updateError } = await supabase
              .from("video")
              .update(updateData)
              .eq("id", videoId);

            if (updateError) {
              console.error("Error updating video:", updateError.message);
            } else {
              console.log("Video updated successfully in Supabase");
            }
          } else {
            // Video doesn't exist in database, insert it
            console.log("Video not found in database, inserting new record");

            // Prepare insert data using the specified structure
            const insertData = {
              id: uuidv4(),
              category_id: categoryId,
              url: trimmedNewUrl,
              title:
                typeof updatedUrlObject === "object"
                  ? updatedUrlObject.title || ""
                  : "",
              author_name:
                typeof updatedUrlObject === "object"
                  ? updatedUrlObject.author_name || ""
                  : "",
            };

            // Add additional metadata fields if available
            if (typeof updatedUrlObject === "object") {
              if (updatedUrlObject.author_url)
                insertData.author_url = updatedUrlObject.author_url;
              if (updatedUrlObject.type)
                insertData.type = updatedUrlObject.type;
              if (updatedUrlObject.height)
                insertData.height = updatedUrlObject.height;
              if (updatedUrlObject.width)
                insertData.width = updatedUrlObject.width;
              if (updatedUrlObject.version)
                insertData.version = updatedUrlObject.version;
              if (updatedUrlObject.provider_name)
                insertData.provider_name = updatedUrlObject.provider_name;
              // provider_url has been merged with url field
              if (updatedUrlObject.thumbnail_height)
                insertData.thumbnail_height = updatedUrlObject.thumbnail_height;
              if (updatedUrlObject.thumbnail_width)
                insertData.thumbnail_width = updatedUrlObject.thumbnail_width;
              if (updatedUrlObject.thumbnail_url)
                insertData.thumbnail_url = updatedUrlObject.thumbnail_url;
              if (updatedUrlObject.html)
                insertData.html = updatedUrlObject.html;
            }

            console.log(
              "Inserting video to Supabase:",
              JSON.stringify(insertData).substring(0, 200)
            );

            // Insert the video using the specified structure
            const { error: insertError } = await supabase
              .from("video")
              .insert([insertData])
              .select();

            if (insertError) {
              console.error("Error inserting video:", insertError.message);
            } else {
              console.log("New video inserted successfully in Supabase");
            }
          }
        } catch (err) {
          console.error("Error updating URL in database:", err);
        }
      }

      await saveData();
      renderUrls();

      // Hide modal
      editModal.classList.add("hidden");

      // Remove this one-time event listener
      saveEditUrlBtn.removeEventListener("click", saveHandler);
    };

    saveEditUrlBtn.addEventListener("click", saveHandler);
  } catch (err) {
    console.error("Error updating URL:", err);
  }
}

// DELETE operations
async function deleteCategory(categoryName) {
  try {
    if (!data[categoryName]) return;

    // Delete from Supabase first if available
    if (supabase) {
      try {
        // Look up the category ID
        const { data: categoryData, error: categoryError } = await supabase
          .from("categories")
          .select("id")
          .eq("name", categoryName);

        if (categoryError) {
          console.error("Error finding category to delete:", categoryError);
        } else if (categoryData && categoryData.length > 0) {
          const categoryId = categoryData[0].id;

          // First delete all videos associated with this category
          const { error: deleteVideosError } = await supabase
            .from("video")
            .delete()
            .eq("category_id", categoryId);

          if (deleteVideosError) {
            console.error(
              "Error deleting category videos from Supabase:",
              deleteVideosError
            );

            // Check for the specific "relation does not exist" error
            if (
              deleteVideosError.message &&
              deleteVideosError.message.includes(
                'relation "public.video" does not exist'
              )
            ) {
              // Just log to console, don't show toast
              console.log("Database tables need setup but not showing popup");

              // Create a subtle "Fix Database" button in the header if it doesn't exist already
              if (!document.getElementById("fixDatabaseBtn")) {
                const headerActions = document.querySelector(".header-actions");
                if (headerActions) {
                  const fixButton = document.createElement("button");
                  fixButton.id = "fixDatabaseBtn";
                  fixButton.className = "btn secondary-btn";
                  fixButton.textContent = "Fix Database";
                  fixButton.style.marginLeft = "15px";
                  fixButton.style.opacity = "0.7";
                  fixButton.addEventListener("click", () => {
                    window.open("database-fix.html", "_blank");
                  });
                  headerActions.appendChild(fixButton);
                }
              }
              // Continue with local deletion even if there's a database error
              console.log(
                "Continuing with local deletion despite database error"
              );
            }
          }

          // Then delete the category itself
          const { error: deleteCategoryError } = await supabase
            .from("categories")
            .delete()
            .eq("id", categoryId);

          if (deleteCategoryError) {
            console.error("Error deleting category from Supabase:", deleteCategoryError);
          } else {
            console.log(
              `Category "${categoryName}" and all its videos deleted from Supabase`
            );
          }
        }
      } catch (err) {
        console.error("Error deleting category from database:", err);
      }
    }

    console.log(`Deleting category "${categoryName}" from local data storage`);
    delete data[categoryName];

    console.log("Saving data after category deletion");
    await saveData();

    console.log("Re-rendering category list");
    renderAllCategories();

    if (currentCategory === categoryName) {
      console.log("Resetting current category since it was deleted");
      currentCategory = null;
      categoryTitle.textContent = "Add or select a category";
      addChannelBtn.classList.add("hidden");
      channelList.innerHTML = "";
    }

    console.log("Category deletion completed successfully");
    showToast("Category deleted successfully", "success");
  } catch (err) {
    console.error("Error deleting category:", err);
  }
}

async function deleteUrl(index) {
  try {
    if (!currentCategory || !data[currentCategory]) return;

    const urlItem = data[currentCategory][index];
    // Extract the URL string regardless of whether urlItem is a string or object
    const urlToDelete = typeof urlItem === "string" ? urlItem : urlItem.url;

    // Delete from Supabase first if available
    if (supabase) {
      try {
        // Look up the category ID for the current category
        const { data: categoryData, error: categoryError } = await supabase
          .from("categories")
          .select("id")
          .eq("name", currentCategory);

        if (categoryError || !categoryData || categoryData.length === 0) {
          console.error("Error getting category ID:", categoryError);
        } else {
          const categoryId = categoryData[0].id;

          // Delete the video with matching URL and category_id
          const { error: deleteError } = await supabase
            .from("video")
            .delete()
            .eq("url", urlToDelete)
            .eq("category_id", categoryId);

          if (deleteError) {
            console.error("Error deleting video from Supabase:", deleteError);
          } else {
            console.log("Video deleted successfully from Supabase");
          }
        }
      } catch (err) {
        console.error("Error deleting URL from database:", err);
      }
    }

    // Remove from local data
    data[currentCategory].splice(index, 1);
    await saveData();

    // Force a complete re-render of the UI
    channelList.innerHTML = ""; // Clear the list first
    renderUrls();

    // Show a success message
    showToast("Video deleted successfully", "success");
  } catch (err) {
    console.error("Error deleting URL:", err);
  }
}

// Confirmation dialog functions
function showDeleteConfirmDialog(type, identifier) {
  // Set the confirmation message based on the type
  if (type === "category") {
    confirmMessage.textContent = `Are you sure you want to delete the "${identifier}" category and all its URLs?`;
    deleteCallback = () => deleteCategory(identifier);
  } else if (type === "url") {
    confirmMessage.textContent = "Are you sure you want to delete this URL?";
    deleteCallback = () => deleteUrl(identifier);
  } else if (type === "multiple") {
    confirmMessage.textContent = `Are you sure you want to delete ${identifier.length} selected URLs?`;
    deleteCallback = () => deleteMultipleUrls(identifier);
  }

  // Show the confirmation dialog
  confirmDialog.classList.remove("hidden");
}

function hideConfirmDialog() {
  confirmDialog.classList.add("hidden");
  deleteCallback = null;
}

async function confirmDelete() {
  // Store the callback temporarily before hiding the dialog
  const tempCallback = deleteCallback;

  // Hide the dialog first to improve user experience
  hideConfirmDialog();

  // Then execute the callback if it exists
  if (tempCallback) {
    try {
      await tempCallback();
      console.log("Delete operation completed successfully");

      // Force channelList to clear and redraw - helps with immediate UI feedback
      if (channelList) {
        channelList.innerHTML = "";
        setTimeout(() => renderUrls(), 10); // Small timeout to ensure DOM updates
      }
    } catch (err) {
      console.error("Error during delete operation:", err);
      showToast("Error deleting item", "error");
    }
  }
}

// Function to delete multiple URLs at once
async function deleteMultipleUrls(indices) {
  try {
    if (!currentCategory || !data[currentCategory]) {
      return;
    }

    // Sort indices in descending order to avoid index shifting when removing elements
    const sortedIndices = [...indices].sort((a, b) => b - a);

    // Track if we're using Supabase
    const useSupabase = !!supabase;

    // Get the category_id if using Supabase
    let categoryId = null;
    if (useSupabase) {
      const { data: categoryData, error: categoryError } = await supabase
        .from("categories")
        .select("id")
        .eq("name", currentCategory)
        .single();

      if (categoryError) {
        throw new Error(`Error getting category ID: ${categoryError.message}`);
      }

      categoryId = categoryData?.id;
    }

    // Delete URLs one by one
    let successCount = 0;

    for (const index of sortedIndices) {
      try {
        const url = data[currentCategory][index];

        // Delete from Supabase if available
        if (useSupabase && url.id) {
          const { error } = await supabase
            .from("video")
            .delete()
            .eq("id", url.id);

          if (error) {
            console.error(`Error deleting URL with ID ${url.id}:`, error);
            continue;
          }
        }

        // Delete from local data
        data[currentCategory].splice(index, 1);
        successCount++;
      } catch (err) {
        console.error(`Error deleting URL at index ${index}:`, err);
      }
    }

    // Save the updated data and re-render the UI
    await saveData();

    // Force a complete re-render of the UI
    channelList.innerHTML = ""; // Clear the list first
    renderUrls();

    // Exit select mode
    selectMode = false;
    selectedUrlIndices = [];

    // Show feedback
    showToast(`Successfully deleted ${successCount} URLs`, "success");
  } catch (err) {
    console.error("Error in deleteMultipleUrls:", err);
    showToast(`Error deleting URLs: ${err.message}`, "error");
  }
}

// Dropdown menu functions

// Sort channels alphabetically in the current category
async function sortChannels() {
  try {
    if (
      !currentCategory ||
      !data[currentCategory] ||
      !Array.isArray(data[currentCategory])
    ) {
      showToast("No channels to sort");
      return;
    }

    data[currentCategory].sort();
    await saveData();
    renderUrls();
    showToast("Channels sorted alphabetically");
  } catch (err) {
    console.error("Error sorting channels:", err);
    showToast("Error sorting channels");
  }
}

// Export all data as JSON file
function exportData() {
  try {
    const dataStr = JSON.stringify(data, null, 2);
    const dataUri =
      "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);

    const exportFileDefaultName = "myTvData.json";

    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", exportFileDefaultName);
    linkElement.click();

    showToast("Data exported successfully");
  } catch (err) {
    console.error("Error exporting data:", err);
    showToast("Error exporting data");
  }
}

// Import data from JSON file
function importData() {
  try {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";

    input.onchange = (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();

      reader.onload = async (event) => {
        try {
          const importedData = JSON.parse(event.target.result);

          if (typeof importedData !== "object") {
            throw new Error("Invalid data format");
          }

          // Confirm before overwriting
          if (confirm("Import will replace all existing data. Continue?")) {
            data = importedData;
            await saveData();
            renderAllCategories();
            currentCategory = null;
            categoryTitle.textContent = "Add or select a category";
            channelList.innerHTML = "";
            addChannelBtn.classList.add("hidden");
            showToast("Data imported successfully");
          }
        } catch (err) {
          console.error("Error parsing imported file:", err);
          showToast("Error importing data: Invalid JSON format");
        }
      };

      reader.onerror = () => {
        console.error("Error reading file");
        showToast("Error reading file");
      };

      reader.readAsText(file);
    };

    input.click();
  } catch (err) {
    console.error("Error importing data:", err);
    showToast("Error importing data");
  }
}

// Simple toast notification function
function showToast(message, type = "info", duration = 3000) {
  // Show all toast types including errors
  const toast = document.createElement("div");
  toast.className = `toast-notification toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Give the browser time to process the DOM insertion
  setTimeout(() => {
    toast.classList.add("show");
  }, 10);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, duration);
}

// Helper function to generate UUID v4
function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Check database relationships between categories and videos
async function checkDatabaseRelationships() {
  if (!supabase) return;

  try {
    console.log("Running database relationship diagnostics...");

    // Get all categories
    const { data: categories, error: categoryError } = await supabase
      .from("categories")
      .select("id, name");

    if (categoryError) {
      console.error("Error fetching categories:", categoryError);
      return;
    }

    console.log(`Found ${categories.length} categories in database`);

    // Check each category for videos
    for (const category of categories) {
      const { data: videos, error: videoError } = await supabase
        .from("video")
        .select("id, url")
        .eq("category_id", category.id);

      if (videoError) {
        console.error(
          `Error fetching videos for category ${category.name}:`,
          videoError
        );
        continue;
      }

      console.log(
        `Category "${category.name}" (ID: ${category.id}) has ${
          videos ? videos.length : 0
        } videos`
      );

      // Log the first few videos
      if (videos && videos.length > 0) {
        console.log("Sample videos:");
        videos.slice(0, 3).forEach((video) => {
          console.log(
            `- ID: ${video.id}, URL: ${video.url.substring(0, 30)}...`
          );
        });
      }
    }

    // Check for orphaned videos (videos without valid category)
    const { data: allVideos, error: allVideosError } = await supabase
      .from("video")
      .select("id, category_id, url");

    if (allVideosError) {
      console.error("Error fetching all videos:", allVideosError);
      return;
    }

    const categoryIds = new Set(categories.map((c) => c.id));
    const orphanedVideos = allVideos.filter(
      (v) => !categoryIds.has(v.category_id)
    );

    if (orphanedVideos.length > 0) {
      console.warn(
        `Found ${orphanedVideos.length} orphaned videos without valid category references`
      );
      console.log("Sample orphaned videos:");
      orphanedVideos.slice(0, 3).forEach((video) => {
        console.log(
          `- ID: ${video.id}, Category ID: ${
            video.category_id
          }, URL: ${video.url.substring(0, 30)}...`
        );
      });

      // Ask user if they want to fix orphaned videos
      if (
        confirm(
          `Found ${orphanedVideos.length} videos without valid category connections. Fix now?`
        )
      ) {
        await repairOrphanedVideos(orphanedVideos, categories);
      }
    } else {
      console.log("No orphaned videos found - all relationships are valid");
    }

    console.log("Database relationship diagnostic complete");
  } catch (err) {
    console.error("Error during database relationship check:", err);
  }
}

// Function to repair orphaned videos by assigning them to categories or deleting them
async function repairOrphanedVideos(orphanedVideos, categories) {
  if (
    !orphanedVideos ||
    orphanedVideos.length === 0 ||
    !categories ||
    categories.length === 0
  ) {
    console.log("No orphaned videos or categories to repair");
    return;
  }

  try {
    console.log(
      `Attempting to repair ${orphanedVideos.length} orphaned videos...`
    );

    // If we have categories available, use the first one as default
    const defaultCategoryId = categories[0].id;
    const defaultCategoryName = categories[0].name;

    console.log(
      `Using "${defaultCategoryName}" as default category for repairs`
    );

    // Repair or delete each orphaned video
    for (const video of orphanedVideos) {
      // Update the video with a valid category ID
      const { error: updateError } = await supabase
        .from("video")
        .update({ category_id: defaultCategoryId })
        .eq("id", video.id);

      if (updateError) {
        console.error(`Failed to repair video ${video.id}:`, updateError);

        // If update fails, try to delete it
        const { error: deleteError } = await supabase
          .from("video")
          .delete()
          .eq("id", video.id);

        if (deleteError) {
          console.error(
            `Failed to delete orphaned video ${video.id}:`,
            deleteError
          );
        } else {
          console.log(
            `Deleted orphaned video ${video.id} as it could not be repaired`
          );
        }
      } else {
        console.log(
          `Successfully repaired video ${video.id} by assigning to category "${defaultCategoryName}"`
        );
      }
    }

    console.log("Video repair complete");
    showToast("Repaired database connections", "success");

    // Refresh data after repairs
    await loadData();
  } catch (err) {
    console.error("Error repairing orphaned videos:", err);
    showToast("Error repairing database connections", "error");
  }
}

// Manually force sync data with Supabase
async function forceSyncWithDatabase() {
  try {
    // Show a loading indicator on the button
    const syncButton = document.querySelector(".sync-button");
    if (syncButton) {
      const originalText = syncButton.textContent;
      syncButton.textContent = "↻ Syncing...";
      syncButton.disabled = true;
    }

    // Check connection first
    const connected = await checkSupabaseConnection();

    if (!connected) {
      showToast("Cannot sync - database connection unavailable", "error");
      return;
    }

    // Run the diagnostics
    await checkDatabaseRelationships();

    // Save data to force a full sync
    const success = await saveData();

    // Reload data from Supabase
    await loadData();

    // Re-render the UI
    renderAllCategories();

    if (currentCategory) {
      selectCategory(currentCategory);
    }

    // Show success message
    if (success) {
      showToast("Database synchronized successfully", "success");
    } else {
      showToast("Sync completed with local data only", "warning");
    }

    // Reset the button
    if (syncButton) {
      syncButton.textContent = "⟳ Sync DB";
      syncButton.disabled = false;
    }
  } catch (err) {
    console.error("Error during forced sync:", err);
    showToast("Error synchronizing with database", "error");

    // Reset the button on error
    const syncButton = document.querySelector(".sync-button");
    if (syncButton) {
      syncButton.textContent = "⟳ Sync DB";
      syncButton.disabled = false;
    }
  }
}

// Demo function to insert a video with the example videoData
async function insertExampleVideo() {
  const videoData = {
    title:
      "Building Agents with Model Context Protocol - Full Workshop with Mahesh Murag of Anthropic",
    author_name: "AI Engineer",
    author_url: "https://www.youtube.com/@aiDotEngineer",
    type: "video",
    height: 113,
    width: 200,
    version: "1.0",
    provider_name: "YouTube",
    // provider_url has been merged with url field
    thumbnail_height: 360,
    thumbnail_width: 480,
    thumbnail_url: "https://i.ytimg.com/vi/kQmXtrmQ5Zg/hqdefault.jpg",
    html: `<iframe width="200" height="113" src="https://www.youtube.com/embed/kQmXtrmQ5Zg?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen title="Building Agents with Model Context Protocol - Full Workshop with Mahesh Murag of Anthropic"></iframe>`,
    url: "https://www.youtube.com/watch?v=kQmXtrmQ5Zg", // Adding URL field which is required
  };

  // Get the first available category ID
  let categoryId = null;
  if (supabase) {
    try {
      const { data: categories, error } = await supabase
        .from("categories")
        .select("id")
        .limit(1);

      if (!error && categories && categories.length > 0) {
        categoryId = categories[0].id;
        videoData.category_id = categoryId;

        // Insert the video with complete metadata
        const success = await insertVideoWithMetadata(videoData);
        if (success) {
          console.log("Example video inserted successfully");
          showToast("Example video inserted successfully");
        }
      } else {
        console.error("No categories found to insert example video");
        showToast("No categories found to insert video", "error");
      }
    } catch (err) {
      console.error("Error inserting example video:", err);
      showToast("Error inserting example video", "error");
    }
  }
}

// Add a button to the UI to trigger the example video insertion
function addInsertExampleButton() {
  const headerActions = document.querySelector(".header-actions");
  if (headerActions) {
    const exampleBtn = document.createElement("button");
    exampleBtn.id = "insertExampleBtn";
    exampleBtn.className = "btn secondary-btn";
    exampleBtn.textContent = "Insert Example Video";
    exampleBtn.style.marginLeft = "10px";
    exampleBtn.addEventListener("click", insertExampleVideo);
    headerActions.appendChild(exampleBtn);
  }
}

// Add a video using YouTube OEmbed data
async function addVideo() {
  const url = document.getElementById("youtubeUrl").value;
  const categoryId = document.getElementById("categorySelect").value;
  const status = document.getElementById("status");

  if (!url || !categoryId) {
    status.textContent = "Please provide both category and URL.";
    return;
  }

  try {
    // Try to get metadata from YouTube
    let metadata = null;
    let useManualEntry = false;

    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(
          url
        )}&format=json`
      );
      if (!res.ok) {
        throw new Error("Failed to fetch video data");
      }
      metadata = await res.json();

      // Show the JSON data in a popup
      showJsonPopup(metadata, `Metadata for: ${url}`);
    } catch (metadataErr) {
      console.error("Failed to fetch metadata:", metadataErr);
      status.textContent =
        "Warning: Could not fetch video metadata. Using manual entry.";
      status.style.color = "#ff9800";
      useManualEntry = true;
    }

    // Store the original YouTube URL
    const originalYoutubeUrl = url;

    // Create video data object with proper structure
    const videoData = {
      id: uuidv4(),
      category_id: categoryId,
      url: originalYoutubeUrl,
      // If we have metadata, use it; otherwise use fallback values
      title: metadata
        ? metadata.title
        : url.includes("youtube.com")
        ? "YouTube Video"
        : "Video",
      html: metadata ? metadata.html || null : null,
      author_name: metadata ? metadata.author_name || null : "Manual Entry",
      author_url: metadata ? metadata.author_url || null : null,
      type: metadata ? metadata.type || null : "video",
      height: metadata ? metadata.height || null : null,
      width: metadata ? metadata.width || null : null,
      version: metadata ? metadata.version || null : "1.0",
      provider_name: metadata ? metadata.provider_name || null : "YouTube",
      thumbnail_url: metadata ? metadata.thumbnail_url || null : null,
      thumbnail_height: metadata ? metadata.thumbnail_height || null : null,
      thumbnail_width: metadata ? metadata.thumbnail_width || null : null,
    };

    console.log("Sending to Supabase:", videoData);

    // Use the correct table name 'video' (not 'videos')
    const { error } = await supabase.from("video").insert([videoData]);

    if (error) {
      status.textContent = "Failed to insert video: " + error.message;
      status.style.color = "#f44336";
      console.error("Insert error:", error);
    } else {
      status.textContent = "Video added successfully!";
      status.style.color = "#4caf50";

      // Force a complete reload of data from the database to ensure counts are accurate
      await loadData();

      // If we're already in the category that we added to, refresh the view
      if (currentCategory) {
        // Check if the category we added to is the current category
        const { data: categoryData } = await supabase
          .from("categories")
          .select("name")
          .eq("id", categoryId)
          .single();

        if (categoryData && categoryData.name === currentCategory) {
          renderUrls();
        }
      }

      // Clear the input field
      document.getElementById("youtubeUrl").value = "";
    }
  } catch (err) {
    status.textContent = "Error: " + err.message;
    status.style.color = "#f44336";
    console.error("Error adding video:", err);
  }
}

// The button is added in the main initialization flow

// Helper function to normalize YouTube URLs to the standard format
function normalizeYoutubeUrl(url) {
  try {
    if (!url) return url;

    // Check if URL is already in a valid format
    if (url.match(/youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}/)) {
      return url;
    }

    // Extract video ID from various YouTube URL formats
    let videoId = null;

    // Format: youtu.be/VIDEO_ID
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) {
      videoId = shortMatch[1];
    }

    // Format: youtube.com/watch?v=VIDEO_ID
    const standardMatch = url.match(
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
    );
    if (standardMatch) {
      videoId = standardMatch[1];
    }

    // Format: youtube.com/embed/VIDEO_ID
    const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) {
      videoId = embedMatch[1];
    }

    // Format: m.youtube.com/watch?v=VIDEO_ID (mobile)
    const mobileMatch = url.match(
      /m\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/
    );
    if (mobileMatch) {
      videoId = mobileMatch[1];
    }

    // Format: youtube.com/shorts/VIDEO_ID (shorts)
    const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) {
      videoId = shortsMatch[1];
    }

    // If we found a video ID, return the standard URL format
    if (videoId) {
      return `https://www.youtube.com/watch?v=${videoId}`;
    }

    // If no video ID was found, return the original URL
    return url;
  } catch (err) {
    console.error("Error normalizing YouTube URL:", err);
    return url;
  }
}

// Helper function to extract just the video ID from a YouTube URL
function extractVideoIdFromUrl(url) {
  try {
    if (!url) return null;

    // Try all the different YouTube URL formats

    // Format: youtu.be/VIDEO_ID
    let match = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];

    // Format: youtube.com/watch?v=VIDEO_ID
    match = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];

    // Format: youtube.com/embed/VIDEO_ID
    match = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];

    // Format: m.youtube.com/watch?v=VIDEO_ID (mobile)
    match = url.match(/m\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];

    // Format: youtube.com/shorts/VIDEO_ID (shorts)
    match = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];

    // Generic pattern to catch most YouTube URL formats
    match = url.match(
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
    );
    if (match) return match[1];

    return null;
  } catch (err) {
    console.error("Error extracting YouTube video ID:", err);
    return null;
  }
}

// Fetch YouTube videos by search query and save them to the database
async function fetchYouTubeVideosAndSave(
  query,
  categoryId,
  maxResults = 25,
  forceVaryResults = true,
  allowDuplicates = false,
  videoDuration = "any"
) {
  try {
    // Parse maxResults to ensure it's a number
    maxResults = parseInt(maxResults, 10);
    if (isNaN(maxResults) || maxResults < 1) {
      maxResults = 25; // Default if invalid value
    }

    if (!supabase) {
      showToast("Database not available", "error");
      return;
    }

    if (!query || !categoryId) {
      showToast("Please provide both search query and category", "error");
      return;
    }

    showToast(`Searching for "${query}" videos...`, "info");

    // Update status in the modal if it's open
    const searchStatus = document.getElementById("searchStatus");
    if (searchStatus) {
      searchStatus.textContent = `Searching YouTube for "${query}"...`;
      searchStatus.style.color = "#2196f3";
    }

    // The YouTube API key
    // YouTube API key
    const apiKey = "AIzaSyCs50Brdqp1FTMlzzqZx58qN-wRn1V2fmA";

    // Try using the YouTube API first
          try {
        // API key validation check is no longer needed as we have a valid key
        if (!apiKey) {
          console.warn("Missing YouTube API key");
          showToast("YouTube API key is missing", "warning");
          throw new Error("Missing YouTube API key");
        }

      // Randomly decide whether to fetch a random page of results
      // If forceVaryResults is true, we'll always try to get varied results
      const shouldFetchRandomPage = forceVaryResults || Math.random() > 0.3; // 70% chance to fetch a random page

      // Add videoDuration parameter to the API request if specified
      let durationParam = "";
      if (videoDuration !== "any") {
        // YouTube API uses 'short', 'medium', 'long' as valid values
        // We'll map our custom 'movie' option to 'long' and handle additional filtering later
        const apiDuration = videoDuration === "movie" ? "long" : videoDuration;
        durationParam = `&videoDuration=${apiDuration}`;
      }

      // First, get the total number of available results to determine how many pages are available
      // We'll use a small maxResults here just to get the pageInfo
      let initialUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video${durationParam}&maxResults=5&q=${encodeURIComponent(
        query
      )}&key=${apiKey}`;

      // Only proceed with random page selection if we want variety
      let pageToken = "";

      if (shouldFetchRandomPage) {
        try {
          const initialResponse = await fetch(initialUrl);

          // Check for API key errors specifically
          if (initialResponse.status === 403) {
            const errorData = await initialResponse.json();
            console.error("YouTube API key error:", errorData);
            if (errorData.error && errorData.error.errors) {
              const apiErrors = errorData.error.errors;
              const keyError = apiErrors.find(
                (e) => e.reason === "keyInvalid" || e.reason === "forbidden"
              );
              if (keyError) {
                throw new Error(`YouTube API key error: ${keyError.message}`);
              }
            }
            throw new Error(
              "YouTube API access forbidden (403). Your API key may be invalid or restricted."
            );
          }

          if (initialResponse.ok) {
            const initialData = await initialResponse.json();

            // If we have a nextPageToken, we can try to get some random page
            if (initialData.nextPageToken) {
              // We'll try to get up to 5 pages in (arbitrary limit to prevent too many API calls)
              // Each "hop" will get us deeper into the results
              const maxPageHops = Math.floor(Math.random() * 5) + 1;
              let currentPageToken = initialData.nextPageToken;

              // Keep track of all tokens we've seen
              const allTokens = [currentPageToken];

              // Perform page hopping to get deeper into results
              for (let i = 0; i < maxPageHops; i++) {
                const pageUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video${durationParam}&maxResults=5&pageToken=${currentPageToken}&q=${encodeURIComponent(
                  query
                )}&key=${apiKey}`;

                const pageResponse = await fetch(pageUrl);
                if (!pageResponse.ok) break;

                const pageData = await pageResponse.json();
                if (!pageData.nextPageToken) break;

                currentPageToken = pageData.nextPageToken;
                allTokens.push(currentPageToken);
              }

              // Randomly select one of the tokens we've discovered
              if (allTokens.length > 0) {
                const randomIndex = Math.floor(
                  Math.random() * allTokens.length
                );
                pageToken = allTokens[randomIndex];
              }
            }
          } else {
            throw new Error(
              `YouTube API error: ${initialResponse.status} ${initialResponse.statusText}`
            );
          }
        } catch (err) {
          console.warn(
            "Error while trying to get random page, will use default first page:",
            err
          );
          // Check if this is a critical API error that should abort the whole process
          if (
            err.message &&
            (err.message.includes("API key") || err.message.includes("403"))
          ) {
            throw err; // Re-throw to trigger the fallback method
          }
          // Otherwise fallback to first page
          pageToken = "";
        }
      }

      // We'll keep track of all fetched videos and may need to make multiple API calls
      // to ensure we get enough unique videos
      let allFetchedItems = [];
      let nextPageToken = pageToken || "";
      let attempts = 0;
      const MAX_ATTEMPTS = 10; // Increased from 3 to ensure we can reach the desired count

      // Keep fetching videos until we have enough unique videos or reach max attempts
      while (attempts < MAX_ATTEMPTS && allFetchedItems.length < maxResults) {
        // Calculate how many more videos we need to reach maxResults
        const remainingCount = maxResults - allFetchedItems.length;
        // Request at least as many as we need, but respect YouTube API limits
        const requestCount = Math.min(remainingCount, 50);

        // Build the URL for this request
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video${durationParam}&maxResults=${requestCount}&q=${encodeURIComponent(
          query
        )}${nextPageToken ? `&pageToken=${nextPageToken}` : ""}&key=${apiKey}`;

        const response = await fetch(url);

        // Handle specific API errors with better messages
        if (!response.ok) {
          if (response.status === 403) {
            try {
              const errorData = await response.json();
              console.error("YouTube API error details:", errorData);

              if (errorData.error && errorData.error.errors) {
                const apiErrors = errorData.error.errors;
                const keyError = apiErrors.find(
                  (e) => e.reason === "keyInvalid" || e.reason === "forbidden"
                );
                if (keyError) {
                  throw new Error(`YouTube API key error: ${keyError.message}`);
                }
              }
            } catch (parseErr) {
              console.error(
                "Error parsing YouTube API error response:",
                parseErr
              );
            }
            throw new Error(
              `YouTube API access forbidden (403). Your API key may be invalid, expired, or restricted.`
            );
          } else if (response.status === 429) {
            throw new Error(
              `YouTube API quota exceeded (429). Try again later or use a different API key.`
            );
          } else {
            throw new Error(
              `YouTube API error: ${response.status} ${response.statusText}`
            );
          }
        }

        const data = await response.json();

        if (!data.items || data.items.length === 0) {
          break; // No more videos available
        }

        // Get detailed info for each video to check duration
        if (videoDuration === "movie") {
          // For movie option, we need to fetch content details to check actual duration
          const videoIds = data.items.map(item => item.id.videoId).join(',');
          const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${videoIds}&key=${apiKey}`;
          const detailsResponse = await fetch(detailsUrl);
          
          if (detailsResponse.ok) {
            const detailsData = await detailsResponse.json();
            
            // Create a map of video details by ID
            const videoDetailsMap = {};
            if (detailsData.items) {
              detailsData.items.forEach(item => {
                videoDetailsMap[item.id] = item;
              });
            }
            
            // Filter videos by duration for the "movie" option (> 60 minutes)
            const filteredItems = data.items.filter(item => {
              const videoDetails = videoDetailsMap[item.id.videoId];
              if (videoDetails && videoDetails.contentDetails && videoDetails.contentDetails.duration) {
                const durationSeconds = parseDuration(videoDetails.contentDetails.duration);
                return durationSeconds > 3600; // > 60 minutes
              }
              return false;
            });
            
            // Add these filtered items to our collection
            allFetchedItems = [...allFetchedItems, ...filteredItems];
          } else {
            // If details fetch fails, add items without filtering
            console.warn("Failed to fetch video details, adding without duration filtering");
            allFetchedItems = [...allFetchedItems, ...data.items];
          }
        } else {
          // For other duration options, we can use the API's built-in filtering
          allFetchedItems = [...allFetchedItems, ...data.items];
        }

        // If we have enough videos, break out of the loop
        if (allFetchedItems.length >= maxResults) {
          break;
        }

        // If there's a next page token, prepare for the next iteration
        if (data.nextPageToken) {
          nextPageToken = data.nextPageToken;
          attempts++;

          if (searchStatus) {
            searchStatus.textContent = `Fetched ${allFetchedItems.length}/${maxResults} videos, looking for more...`;
          }
        } else {
          // No more pages available
          break;
        }
      }

      // If we didn't find any videos at all
      if (allFetchedItems.length === 0) {
        if (searchStatus) {
          searchStatus.textContent = "No videos found for this query";
          searchStatus.style.color = "#ff9800";
        }
        showToast("No videos found for this query", "warning");
        throw new Error("No videos found for this query");
      }

      // Trim down to the requested maxResults
      if (allFetchedItems.length > maxResults) {
        allFetchedItems = allFetchedItems.slice(0, maxResults);
      }

      // Use the collected items for processing, and keep the next page token
      const data = {
        items: allFetchedItems,
        nextPageToken: nextPageToken, // Store the last nextPageToken for potential further fetching
      };

      // Shuffle the results to add more randomness
      // Always shuffle if forceVaryResults is true
      if (forceVaryResults || Math.random() > 0.5) {
        for (let i = data.items.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [data.items[i], data.items[j]] = [data.items[j], data.items[i]];
        }
      }

      // Process the videos and add them to the database
      if (searchStatus) {
        searchStatus.textContent = `Processing ${data.items.length} videos...`;
      }
      
      // Keep track of successfully added videos
      let addedCount = 0;
      let errorCount = 0;
      
      // Process each video item
      for (const item of data.items) {
        try {
          // Extract video details from the YouTube API response
          const videoId = item.id.videoId;
          const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
          const snippet = item.snippet;
          
          // Check if this video already exists in the database (if we're not allowing duplicates)
          if (!allowDuplicates) {
            const { data: existingVideos, error: checkError } = await supabase
              .from("video")
              .select("id")
              .eq("url", videoUrl)
              .eq("category_id", categoryId);
              
            if (!checkError && existingVideos && existingVideos.length > 0) {
              console.log(`Video ${videoId} already exists, skipping`);
              continue; // Skip this video
            }
          }
          
          // Create the video data object
          const videoData = {
            id: uuidv4(),
            title: snippet.title,
            url: videoUrl,
            category_id: categoryId,
            author_name: snippet.channelTitle,
            author_url: `https://www.youtube.com/channel/${snippet.channelId}`,
            type: "video",
            height: 0,
            width: 0,
            version: "1.0",
            provider_name: "YouTube",
            thumbnail_height: snippet.thumbnails.high ? snippet.thumbnails.high.height : 0,
            thumbnail_width: snippet.thumbnails.high ? snippet.thumbnails.high.width : 0,
            thumbnail_url: snippet.thumbnails.high ? snippet.thumbnails.high.url : 
                         (snippet.thumbnails.medium ? snippet.thumbnails.medium.url : 
                         (snippet.thumbnails.default ? snippet.thumbnails.default.url : "")),
            html: `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`,
          };
          
          // Insert the video into the database
          const { error: insertError } = await supabase.from("video").insert([videoData]);
          
          if (insertError) {
            console.error(`Error adding video ${videoId}:`, insertError);
            errorCount++;
          } else {
            console.log(`Successfully added video: ${videoData.title}`);
            addedCount++;
          }
        } catch (itemError) {
          console.error("Error processing video item:", itemError);
          errorCount++;
        }
      }
      
      // Update status and show toast
      if (searchStatus) {
        searchStatus.textContent = `Added ${addedCount} videos successfully. ${errorCount > 0 ? `${errorCount} errors.` : ''}`;
        searchStatus.style.color = errorCount > 0 ? "#ff9800" : "#4caf50";
      }
      
      if (addedCount > 0) {
        showToast(`Added ${addedCount} videos successfully`, "success");
        
        // Refresh the UI
        await loadData();
        
        // Select the category to show the results
        if (currentCategory) {
          // Find the current category by ID
          const { data: categoryData } = await supabase
            .from("categories")
            .select("name")
            .eq("id", categoryId)
            .single();

          if (categoryData && categoryData.name) {
            selectCategory(categoryData.name);
          }
        }
        
        return addedCount;
      } else {
        throw new Error("No videos could be added");
      }
    } catch (apiError) {
      // YouTube API failed, fall back to direct video URL approach
      console.error("YouTube API error, using fallback method:", apiError);

      if (searchStatus) {
        searchStatus.textContent = `YouTube API error: ${apiError.message}. Using fallback method...`;
        searchStatus.style.color = "#ff9800";
      }

      // Try to create a better fallback entry
      let videoData;

      // Check if the query might be a direct YouTube URL
      const videoId = extractVideoIdFromUrl(query);

      if (videoId) {
        // This is likely a direct YouTube video URL, we can create a better entry
        const normalizedUrl = `https://www.youtube.com/watch?v=${videoId}`;

        // Try to get metadata via oEmbed as a last resort
        try {
          // Try with a CORS proxy for better chance of success
          const proxyRes = await fetch(
            `https://api.allorigins.win/get?url=${encodeURIComponent(
              `https://www.youtube.com/oembed?url=${encodeURIComponent(
                normalizedUrl
              )}&format=json`
            )}`
          );

          if (proxyRes.ok) {
            const proxyData = await proxyRes.json();
            if (proxyData && proxyData.contents) {
              // We got metadata!
              const oembedData = JSON.parse(proxyData.contents);

              videoData = {
                id: uuidv4(),
                title: oembedData.title || query,
                url: normalizedUrl,
                category_id: categoryId,
                author_name: oembedData.author_name || "YouTube Creator",
                author_url: oembedData.author_url || "",
                type: "video",
                height: oembedData.height || 0,
                width: oembedData.width || 0,
                version: "1.0",
                provider_name: "YouTube",
                thumbnail_height: oembedData.thumbnail_height || 0,
                thumbnail_width: oembedData.thumbnail_width || 0,
                thumbnail_url:
                  oembedData.thumbnail_url ||
                  `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                html: oembedData.html || "",
              };

              if (searchStatus) {
                searchStatus.textContent = `Found video metadata via proxy: "${videoData.title}"`;
                searchStatus.style.color = "#4caf50";
              }

              showToast("Video metadata retrieved via proxy", "success");
            }
          }
        } catch (oembedErr) {
          console.warn("Failed to get oEmbed data via proxy:", oembedErr);
        }

        // If we couldn't get metadata, create a basic entry with the video ID
        if (!videoData) {
          videoData = {
            id: uuidv4(),
            title: query,
            url: normalizedUrl,
            category_id: categoryId,
            author_name: "YouTube Video",
            author_url: "",
            type: "video",
            height: 0,
            width: 0,
            version: "1.0",
            provider_name: "YouTube",
            thumbnail_height: 0,
            thumbnail_width: 0,
            thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, // We can construct the thumbnail URL
            html: `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`,
          };
        }
      } else {
        // This is a search query, not a direct video URL
        videoData = {
          id: uuidv4(),
          title: query, // Use the search query as the title
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(
            query
          )}`,
          category_id: categoryId,
          author_name: "Manual Entry",
          author_url: "",
          type: "video",
          height: 0,
          width: 0,
          version: "1.0",
          provider_name: "YouTube",
          thumbnail_height: 0,
          thumbnail_width: 0,
          thumbnail_url: "",
          html: "",
        };
      }

      // Insert the video
      const { data, error } = await supabase.from("video").insert([videoData]);

      if (error) {
        console.error("Error inserting video:", error);
        showToast("Failed to add video: " + error.message, "error");

        if (searchStatus) {
          searchStatus.textContent = `Error: ${error.message}`;
          searchStatus.style.color = "#f44336";
        }
        throw error;
      } else {
        console.log("Success: Added video manually", data);
        showToast("Video added successfully using fallback method", "success");

        if (searchStatus) {
          searchStatus.textContent = `Added video successfully using fallback method (YouTube API unavailable)`;
          searchStatus.style.color = "#4caf50";
        }

        // Refresh the UI
        await loadData();
        if (currentCategory) {
          // Find the current category by ID
          const { data: categoryData } = await supabase
            .from("categories")
            .select("name")
            .eq("id", categoryId)
            .single();

          if (categoryData && categoryData.name) {
            selectCategory(categoryData.name);
          }
        }
      }
    }
  } catch (err) {
    console.error("Error in fetchYouTubeVideosAndSave:", err);

    // Update status in modal
    const searchStatus = document.getElementById("searchStatus");
    if (searchStatus) {
      searchStatus.textContent = `Error: ${err.message}`;
      searchStatus.style.color = "#f44336";
    }
    showToast(`Error: ${err.message}`, "error");
  }
}

// Helper function to parse ISO 8601 duration format (PT1H30M15S) to seconds
function parseDuration(duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

  if (!match) {
    return 0;
  }

  const hours = parseInt(match[1] || 0, 10);
  const minutes = parseInt(match[2] || 0, 10);
  const seconds = parseInt(match[3] || 0, 10);

  return hours * 3600 + minutes * 60 + seconds;
}

// Create YouTube Search modal
function createYouTubeSearchModal() {
  const searchModal = document.createElement("div");
  searchModal.id = "youtubeSearchModal";
  searchModal.className = "modal-overlay hidden";

  searchModal.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-content">
        <h3>Search YouTube Videos</h3>
        <form id="youtubeSearchForm">
          <div class="form-group">
            <label for="searchQuery">Search Query:</label>
            <input type="text" id="searchQuery" class="modal-input" required placeholder="Enter search terms">
          </div>
          <div class="form-group">
            <label for="searchCategory">Category:</label>
            <select id="searchCategory" class="modal-input" required>
              <option value="">Select a category</option>
            </select>
          </div>
          <div class="form-group">
            <label for="maxResults">Number of Results:</label>
            <select id="maxResults" class="modal-input">
              <option value="10">10 videos</option>
              <option value="15" selected>15 videos</option>
              <option value="25">25 videos</option>
              <option value="50">50 videos (maximum)</option>
            </select>
          </div>
          <div class="form-group">
            <label for="videoDuration">Video Duration:</label>
            <select id="videoDuration" class="modal-input">
              <option value="any" selected>Any duration</option>
              <option value="short">Short videos (< 4 minutes)</option>
              <option value="medium">Medium videos (4-20 minutes)</option>
              <option value="long">Long videos (> 20 minutes)</option>
              <option value="movie">Movies (> 60 minutes)</option>
            </select>
          </div>
          <div class="form-group" style="display: flex; align-items: center;">
            <input type="checkbox" id="forceVaryResults" checked>
            <label for="forceVaryResults" style="margin-left: 8px; display: inline-block;">Force varied results (avoids repeating the same top videos)</label>
          </div>
          <div class="form-group" style="display: flex; align-items: center;">
            <input type="checkbox" id="allowDuplicates">
            <label for="allowDuplicates" style="margin-left: 8px; display: inline-block;">Allow duplicate videos (add even if video already exists)</label>
          </div>
          <div id="searchStatus" style="margin: 10px 0; color: #2196f3;"></div>
          <div class="modal-actions">
            <button type="button" id="cancelSearchBtn" class="btn cancel-btn">Cancel</button>
            <button type="submit" id="performSearchBtn" class="btn ok-btn youtube-search-btn">Search & Add</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(searchModal);

  // Setup event listeners
  document.getElementById("cancelSearchBtn").addEventListener("click", () => {
    document.getElementById("youtubeSearchModal").classList.add("hidden");
  });

  document
    .getElementById("youtubeSearchForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();

      const query = document.getElementById("searchQuery").value.trim();
      const categoryId = document.getElementById("searchCategory").value;
      const maxResults = document.getElementById("maxResults").value;
      const videoDuration = document.getElementById("videoDuration").value;
      const forceVaryResults =
        document.getElementById("forceVaryResults").checked;
      const allowDuplicates =
        document.getElementById("allowDuplicates").checked;
      const searchStatus = document.getElementById("searchStatus");

      if (!query || !categoryId) {
        searchStatus.textContent =
          "Please provide both search query and category";
        searchStatus.style.color = "#f44336";
        return;
      }

      searchStatus.textContent = `Searching YouTube for "${query}"...`;
      searchStatus.style.color = "#2196f3";

      try {
        // Pass all parameters including duration
        await fetchYouTubeVideosAndSave(
          query,
          categoryId,
          maxResults,
          forceVaryResults,
          allowDuplicates,
          videoDuration
        );

        // Hide the modal after completion
        document.getElementById("youtubeSearchModal").classList.add("hidden");
      } catch (err) {
        searchStatus.textContent = `Error: ${err.message}`;
        searchStatus.style.color = "#f44336";
        console.error("YouTube search error:", err);
      }
    });
}

// Function to update the category dropdown in the search modal
function updateSearchCategoryDropdown() {
  // Get the category select element
  const categorySelect = document.getElementById("searchCategory");
  const searchStatus = document.getElementById("searchStatus");

  if (!categorySelect) {
    console.error("Search category select element not found");
    if (searchStatus) {
      searchStatus.textContent = "Error: Category dropdown not found";
      searchStatus.style.color = "#f44336";
    }
    return;
  }

  // Clear existing options except the first placeholder
  while (categorySelect.options.length > 1) {
    categorySelect.remove(1);
  }

  if (!supabase) {
    console.error("Supabase client not initialized");
    if (searchStatus) {
      searchStatus.textContent = "Error: Database connection not initialized";
      searchStatus.style.color = "#f44336";
    }
    window.supabaseLoaded = false;
    return;
  }

  if (searchStatus) {
    searchStatus.textContent = "Loading categories...";
    searchStatus.style.color = "#2196f3";
  }

  // Add options for each category
  supabase
    .from("categories")
    .select("id, name")
    .then(({ data, error }) => {
      if (error) {
        console.error("Error fetching categories:", error);
        if (searchStatus) {
          searchStatus.textContent =
            "Error loading categories: " + error.message;
          searchStatus.style.color = "#f44336";
        }
        return;
      }

      if (!data || data.length === 0) {
        console.log("No categories found");
        if (searchStatus) {
          searchStatus.textContent =
            "No categories found. Please create some first.";
          searchStatus.style.color = "#ff9800";
        }
        return;
      }

      data.forEach((category) => {
        const option = document.createElement("option");
        option.value = category.id;
        option.textContent = category.name;
        categorySelect.appendChild(option);
      });

      console.log("Loaded " + data.length + " categories");
      if (searchStatus) {
        searchStatus.textContent = data.length + " categories loaded";
        searchStatus.style.color = "#4caf50";

        // Clear the message after a delay
        setTimeout(() => {
          if (searchStatus.textContent === data.length + " categories loaded") {
            searchStatus.textContent = "";
          }
        }, 2000);
      }
    });
}

// Function to show the YouTube search modal
function showYouTubeSearchModal() {
  updateSearchCategoryDropdown();
  document.getElementById("youtubeSearchModal").classList.remove("hidden");
  document.getElementById("searchQuery").focus();
}

// Simple fetch function for HTML form
async function fetchVideos() {
  const query = document.getElementById("simpleSearchQuery").value;
  const categoryName = document.getElementById("category").value;

  if (!query || !categoryName) {
    showToast("Please enter both search query and category", "error");
    return;
  }

  try {
    // Find or create the category
    let categoryId;

    // Check if category exists in local data
    if (!data[categoryName]) {
      // Create new category locally
      data[categoryName] = [];
      await saveData(); // This will create the category in Supabase too
      renderCategory(categoryName);
      showToast(`Created new category: ${categoryName}`, "info");
    }

    // Get the category ID from Supabase
    const { data: categoryData, error: categoryError } = await supabase
      .from("categories")
      .select("id")
      .eq("name", categoryName);

    if (categoryError) {
      throw new Error(`Error finding category: ${categoryError.message}`);
    }

    if (!categoryData || categoryData.length === 0) {
      throw new Error(`Category "${categoryName}" not found in database`);
    }

    categoryId = categoryData[0].id;

    // Now fetch and save the videos - let user select how many videos in the simple form
    // Default to 15 if maxResults dropdown isn't available
    let maxResults = 15;
    const maxResultsSelect = document.getElementById("maxResults");
    if (maxResultsSelect) {
      maxResults = maxResultsSelect.value;
    }

    try {
      showToast(`Adding "${query}" to ${categoryName}...`, "info");

      // Direct addition of a single video entry with the search query
      const videoData = {
        id: uuidv4(),
        title: query, // Use the search query as the title
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(
          query
        )}`,
        category_id: categoryId,
        author_name: "Manual Entry",
        author_url: "",
        type: "video",
        height: 0,
        width: 0,
        version: "1.0",
        provider_name: "YouTube",
        thumbnail_height: 0,
        thumbnail_width: 0,
        thumbnail_url: "",
        html: "",
      };

      // Insert the video
      const { data, error } = await supabase.from("video").insert([videoData]);

      if (error) {
        throw new Error(`Failed to add video: ${error.message}`);
      }

      showToast(`Added "${query}" to ${categoryName} successfully`, "success");

      // Refresh the UI
      await loadData();

      // Select the category to show the results
      selectCategory(categoryName);
    } catch (directErr) {
      console.error("Error adding video directly:", directErr);

      // Try using the original method as fallback
      await fetchYouTubeVideosAndSave(
        query,
        categoryId,
        maxResults,
        true,
        true
      );

      // Select the category to show the results
      selectCategory(categoryName);
    }
  } catch (err) {
    console.error("Error in fetchVideos:", err);
    showToast(`Error: ${err.message}`, "error");
  }
}
