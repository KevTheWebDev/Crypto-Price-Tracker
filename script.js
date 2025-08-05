const API_URL = "https://api.coingecko.com/api/v3/coins/markets";
const chartCache = {};
let currentCurrency = "usd";
let originalData = [];
let sortState = { column: null, direction: null };

document.addEventListener("DOMContentLoaded", () => {
  fetchAndDisplayData();

  document.getElementById("refresh").addEventListener("click", fetchAndDisplayData);
  document.getElementById("search").addEventListener("input", filterCoins);
  document.getElementById("currency-select").addEventListener("change", (e) => {
    currentCurrency = e.target.value;
    localStorage.setItem("currency", currentCurrency);
    fetchAndDisplayData();
  });

  document.getElementById("dark-mode").addEventListener("click", toggleDarkMode);
  document.getElementById("show-favorites").addEventListener("change", filterCoins);

  document.querySelectorAll("th[data-column]").forEach(th => {
    th.addEventListener("click", () => handleSortClick(th.dataset.column));
  });

  // Load preferred currency
  const storedCurrency = localStorage.getItem("currency");
  if (storedCurrency) {
    currentCurrency = storedCurrency;
    document.getElementById("currency-select").value = storedCurrency;
  }

  if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light-mode");
    document.getElementById("dark-mode").textContent = "🌙 Dark Mode";
  }
});

function toggleDarkMode() {
  const body = document.body;
  const modeBtn = document.getElementById("dark-mode");

  body.classList.toggle("light-mode");
  if (body.classList.contains("light-mode")) {
    localStorage.setItem("theme", "light");
    modeBtn.textContent = "🌙 Dark Mode";
  } else {
    localStorage.setItem("theme", "dark");
    modeBtn.textContent = "☀️ Light Mode";
  }
}

async function fetchAndDisplayData() {
  const url = `${API_URL}?vs_currency=${currentCurrency}&order=market_cap_desc&per_page=100&page=1&sparkline=true&price_change_percentage=24h`;
  const res = await fetch(url);
  const data = await res.json();
  originalData = data;
  applySortingAndRender();
}

function handleSortClick(column) {
  if (sortState.column !== column) {
    sortState = { column, direction: "asc" };
  } else if (sortState.direction === "asc") {
    sortState.direction = "desc";
  } else if (sortState.direction === "desc") {
    sortState = { column: null, direction: null }; // reset
  } else {
    sortState.direction = "asc";
  }

  updateSortIcons();
  applySortingAndRender();
}

function updateSortIcons() {
  document.querySelectorAll("th[data-column]").forEach(th => {
    const iconSpan = th.querySelector(".sort-icon");
    const col = th.dataset.column;

    if (sortState.column === col) {
      iconSpan.textContent = sortState.direction === "asc" ? "▲" :
                             sortState.direction === "desc" ? "▼" : "";
    } else {
      iconSpan.textContent = "";
    }
  });
}

function applySortingAndRender() {
  let data = [...originalData];

  if (sortState.column && sortState.direction) {
    const dir = sortState.direction === "asc" ? 1 : -1;

    data.sort((a, b) => {
      switch (sortState.column) {
        case "rank":
          return dir * (a.market_cap_rank - b.market_cap_rank);
        case "name":
          return dir * a.name.localeCompare(b.name);
        case "price":
          return dir * (a.current_price - b.current_price);
        case "change":
          return dir * ((a.price_change_percentage_24h || 0) - (b.price_change_percentage_24h || 0));
        case "volume":
          return dir * (a.total_volume - b.total_volume);
        case "market_cap":
          return dir * (a.market_cap - b.market_cap);
        default:
          return 0;
      }
    });
  }

  renderTable(data);
}

function renderTable(coins) {
  const tbody = document.getElementById("crypto-table");
  tbody.innerHTML = "";

  coins.forEach((coin) => {
    const isFavorited = getFavorites().includes(coin.id);
    const row = document.createElement("tr");
    row.setAttribute("data-id", coin.id);

    row.innerHTML = `
      <td>${coin.market_cap_rank}</td>
      <td>
        <img src="${coin.image}" alt="${coin.name}" width="20" style="vertical-align: middle;"/>
        ${coin.name} (${coin.symbol.toUpperCase()})
        <span class="star ${isFavorited ? "favorited" : ""}" data-id="${coin.id}">★</span>
      </td>
      <td>${formatCurrency(coin.current_price)}</td>
      <td style="color:${coin.price_change_percentage_24h >= 0 ? 'lightgreen' : 'red'}">
        ${coin.price_change_percentage_24h?.toFixed(2)}%
      </td>
      <td>${formatNumber(coin.total_volume)}</td>
      <td>${formatNumber(coin.market_cap)}</td>
      <td><canvas class="sparkline" id="sparkline-${coin.id}"></canvas></td>
    `;

    // Navigate to coin.html on row click (except star click)
    row.addEventListener("click", (e) => {
      if (!e.target.classList.contains("star")) {
        window.location.href = `coin.html?id=${coin.id}`;
      }
    });

    tbody.appendChild(row);
    renderSparkline(coin.id, coin.sparkline_in_7d.price);

    const star = row.querySelector(".star");
    star.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorite(coin.id, star);
    });
  });

  filterCoins(); // maintain active filters
}

function renderSparkline(id, data) {
  const ctx = document.getElementById(`sparkline-${id}`).getContext("2d");
  if (chartCache[id]) {
    chartCache[id].destroy();
  }

  chartCache[id] = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.map((_, i) => i),
      datasets: [{
        data,
        borderColor: "lightgreen",
        borderWidth: 1,
        fill: false,
        tension: 0.3,
        pointRadius: 0,
      }]
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: { display: false },
        y: { display: false }
      }
    }
  });
}

function formatCurrency(num) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currentCurrency.toUpperCase(),
    maximumFractionDigits: 6
  }).format(num);
}

function formatNumber(num) {
  return new Intl.NumberFormat('en-US').format(num);
}

function filterCoins() {
  const search = document.getElementById("search").value.toLowerCase();
  const showFavorites = document.getElementById("show-favorites").checked;
  const rows = document.querySelectorAll("#crypto-table tr");

  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    const coinId = row.querySelector(".star")?.dataset?.id;
    const isFavorited = getFavorites().includes(coinId);
    const matchesSearch = text.includes(search);
    const matchesFavorite = !showFavorites || isFavorited;

    row.style.display = (matchesSearch && matchesFavorite) ? "" : "none";
  });
}

function toggleFavorite(id, starElement) {
  let favorites = getFavorites();
  if (favorites.includes(id)) {
    favorites = favorites.filter(fav => fav !== id);
    starElement.classList.remove("favorited");
  } else {
    favorites.push(id);
    starElement.classList.add("favorited");
  }
  localStorage.setItem("favorites", JSON.stringify(favorites));
  filterCoins();
}

function getFavorites() {
  return JSON.parse(localStorage.getItem("favorites") || "[]");
}
