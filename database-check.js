// Database connection check script
document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  const tablesEl = document.getElementById('tables');
  const errorEl = document.getElementById('error');
  
  // Update status
  function updateStatus(message, type = 'info') {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
  }
  
  // Show error details
  function showError(title, details) {
    errorEl.innerHTML = `<h3>${title}</h3><pre>${JSON.stringify(details, null, 2)}</pre>`;
    errorEl.style.display = 'block';
  }
  
  try {
    updateStatus('Initializing Supabase client...', 'info');
    
    // Wait for Supabase to load
    let attempts = 0;
    while (!window.supabaseLoaded && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (!window.supabaseLoaded) {
      updateStatus('Failed to load Supabase client', 'error');
      showError('Loading Error', 'Supabase client failed to load after waiting 5 seconds');
      return;
    }
    
    // Initialize Supabase
    const supabaseUrl = "https://nqkccargwpcsbygurmbd.supabase.co";
    const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xa2NjYXJnd3Bjc2J5Z3VybWJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk4MDgzODgsImV4cCI6MjA2NTM4NDM4OH0.0jMAsYbpny4zy-aNMjGYlxbu4pXvPnqePXOwrJ1gF1w";
    
    const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
    updateStatus('Supabase client initialized', 'info');
    
    // Check categories table
    updateStatus('Checking categories table...', 'info');
    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('count')
      .limit(1);
      
    if (categoriesError) {
      updateStatus('Error checking categories table', 'error');
      showError('Categories Table Error', categoriesError);
      
      // Check if this is the "relation does not exist" error
      if (categoriesError.message && categoriesError.message.includes('relation "public.categories" does not exist')) {
        tablesEl.innerHTML += `<div class="table-status error">
          <h3>Categories Table</h3>
          <p>Status: Missing</p>
          <p>Error: Table does not exist in the database</p>
          <p>Fix: Run the SQL script in database-fix.sql</p>
        </div>`;
      }
    } else {
      tablesEl.innerHTML += `<div class="table-status success">
        <h3>Categories Table</h3>
        <p>Status: Exists and accessible</p>
      </div>`;
    }
    
    // Check video table
    updateStatus('Checking video table...', 'info');
    const { data: videos, error: videosError } = await supabase
      .from('video')
      .select('count')
      .limit(1);
      
    if (videosError) {
      updateStatus('Error checking video table', 'error');
      showError('Video Table Error', videosError);
      
      // Check if this is the "relation does not exist" error
      if (videosError.message && videosError.message.includes('relation "public.video" does not exist')) {
        tablesEl.innerHTML += `<div class="table-status error">
          <h3>Video Table</h3>
          <p>Status: Missing</p>
          <p>Error: Table does not exist in the database</p>
          <p>Fix: Run the SQL script in database-fix.sql</p>
        </div>`;
      }
    } else {
      tablesEl.innerHTML += `<div class="table-status success">
        <h3>Video Table</h3>
        <p>Status: Exists and accessible</p>
      </div>`;
    }
    
    // Overall status
    if (categoriesError || videosError) {
      updateStatus('Database issues detected', 'error');
      document.getElementById('fix-instructions').style.display = 'block';
    } else {
      updateStatus('Database connection successful', 'success');
    }
    
  } catch (error) {
    updateStatus('Error checking database', 'error');
    showError('General Error', error);
  }
}); 