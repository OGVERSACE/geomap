// Получение ссылки через is.gd (без промежуточных страниц)
async function getMapLink() {
    if (!mapReady || !map) {
        alert('Карта ещё не загружена');
        return;
    }

    const loadingDiv = document.getElementById('loading');
    const originalText = loadingDiv ? loadingDiv.innerHTML : '';

    if (loadingDiv) {
        loadingDiv.style.display = 'block';
        loadingDiv.innerHTML = '🔗 Сокращение ссылки...';
    }

    try {
        saveStateToURL();
        const longUrl = window.location.href;

        // is.gd API (format=simple — возвращает только короткую ссылку)
        const response = await fetch(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Ошибка сокращения');
        }

        const shortUrl = await response.text();
        
        // Проверяем, что получили именно ссылку
        if (!shortUrl.startsWith('https://is.gd/')) {
            throw new Error('Некорректный ответ');
        }
        
        await navigator.clipboard.writeText(shortUrl);
        alert(`✅ Короткая ссылка скопирована!\n\n${shortUrl}\n\nПри переходе откроется сразу ваша карта (без рекламы).`);
        
    } catch (error) {
        console.error('Ошибка:', error);
        const longUrl = window.location.href;
        await navigator.clipboard.writeText(longUrl);
        alert(`⚠️ Не удалось сократить ссылку.\n\nСкопирована полная ссылка:\n${longUrl}`);
    } finally {
        if (loadingDiv) {
            loadingDiv.style.display = 'none';
            loadingDiv.innerHTML = originalText;
        }
    }
}
