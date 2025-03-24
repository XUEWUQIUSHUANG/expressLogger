
let currentPage = 1;
const limit = 13;

document.getElementById('prevPage').addEventListener('click', async () => {
    if (currentPage > 1) {
        currentPage--;
        await fetchLogs();
    }
});

document.getElementById('nextPage').addEventListener('click', async () => {
    currentPage++;
    await fetchLogs();
});

async function fetchLogs() {
    const formData = new FormData(document.getElementById('searchForm'));
    const params = new URLSearchParams();

    const searchBtn = document.querySelector('.search-btn');
    const originalText = searchBtn.innerHTML;

    searchBtn.innerHTML = '加载中...';
    searchBtn.classList.add('loading');

    formData.forEach((value, key) => {
        if (value) params.set(key, value);
    });

    params.set('limit', limit);
    params.set('page', currentPage - 1);

    try {
        const response = await fetch(`/logData?${params}`);
        const json = await response.json();
        const { rows } = json;
        if (rows.length === 0) {
            alert('没有更多数据了');
            currentPage--;
            return;
        }

        const tableBody = document.querySelector('.stunning-table tbody');
        let innerHTML = rows.map((row) => `<tr>
        <td class="method-cell" data-method="${row.method}">${row.method}</td>
        <td>${row.url}</td>
        <td>${row.ip}</td>
        <td>${row.referer}</td>
        <td class="status-cell" data-status="${row.status}">${row.status}</td>
        <td>${row.time}</td>
        <td>${row.duration + "ms"}</td>
    </tr>
    `).join('');
        tableBody.innerHTML = innerHTML;
        updatePaginationInfo();
    } catch (error) {
        console.error('Error fetching logs:', error);
    } finally {
        searchBtn.innerHTML = originalText;
        searchBtn.classList.remove('loading');
    }
}

function updatePaginationInfo() {
    document.getElementById('currentPage').textContent = `第${currentPage}页`;
}

function searchLogs() {
    currentPage = 1;
    fetchLogs();
}