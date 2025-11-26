document.addEventListener('DOMContentLoaded', function() {
  const searchToggle = document.getElementById('search-toggle');
  const searchModal = document.getElementById('search-modal');
  const closeSearch = document.getElementById('close-search');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  let fuse;

  // Open search modal
  searchToggle.addEventListener('click', function(e) {
    e.preventDefault();
    searchModal.style.display = 'flex';
    searchInput.focus();
    if (!fuse) {
      loadSearchIndex();
    }
  });

  // Close search modal
  closeSearch.addEventListener('click', function() {
    searchModal.style.display = 'none';
  });

  // Close modal when clicking outside
  searchModal.addEventListener('click', function(e) {
    if (e.target === searchModal) {
      searchModal.style.display = 'none';
    }
  });

  // Load search index
  function loadSearchIndex() {
    fetch('/index.json')
      .then(response => response.json())
      .then(data => {
        const options = {
          keys: ['title', 'contents', 'tags', 'categories'],
          threshold: 0.3,
          ignoreLocation: true
        };
        fuse = new Fuse(data, options);
      })
      .catch(error => console.error('Error loading search index:', error));
  }

  // Handle input
  searchInput.addEventListener('input', function() {
    if (fuse) {
      const query = this.value;
      const results = fuse.search(query);
      displayResults(results);
    }
  });

  // Display results
  function displayResults(results) {
    searchResults.innerHTML = '';
    if (results.length === 0) {
      searchResults.innerHTML = '<p>No results found.</p>';
      return;
    }

    results.forEach(result => {
      const item = result.item;
      const resultItem = document.createElement('div');
      resultItem.className = 'search-result-item';
      resultItem.innerHTML = `
        <a href="${item.permalink}">${item.title}</a>
        <p>${item.contents.substring(0, 150)}...</p>
      `;
      searchResults.appendChild(resultItem);
    });
  }
});
