const API_BASE_URL = "/api/v1";

async function handleResponse(res) {
    if (res.status === 401) {
        localStorage.removeItem('token');
        window.location.reload();
    }
    
    if (!res.ok) {
        let msg = 'Erro na requisição';
        try {
            const data = await res.json();
            if (data && data.detail) {
                msg = data.detail;
            }
        } catch (_) {}
        throw new Error(msg);
    }
    
    return res.json();
}

const api = {
    async get(endpoint) {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return handleResponse(res);
    },

    async post(endpoint, data) {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        return handleResponse(res);
    },

    async put(endpoint, data) {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        return handleResponse(res);
    },

    async delete(endpoint) {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return handleResponse(res);
    }
};
