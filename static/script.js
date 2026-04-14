// Global state
let uploadedFiles = [];
let chatHistory = [];

// DOM elements
const uploadBtn = document.getElementById('upload-btn');
const uploadModal = document.getElementById('upload-modal');
const closeModalBtns = document.querySelectorAll('.close-modal');
const uploadForm = document.getElementById('upload-form');
const pdfInput = document.getElementById('pdf-input');
const fileDropZone = document.getElementById('file-drop-zone');
const selectedFileDiv = document.getElementById('selected-file');
const fileName = document.getElementById('file-name');
const removeFileBtn = document.getElementById('remove-file');
const uploadSubmitBtn = document.getElementById('upload-submit');
const fileList = document.getElementById('file-list');
const emptyState = document.getElementById('empty-state');
const chatMessages = document.getElementById('chat-messages');
const questionInput = document.getElementById('question-input');
const sendBtn = document.getElementById('send-btn');
const clearChatBtn = document.getElementById('clear-chat');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    // Check if all required elements exist
    const requiredElements = [
        'upload-btn', 'upload-modal', 'upload-form', 'pdf-input',
        'file-drop-zone', 'selected-file', 'file-name', 'remove-file',
        'upload-submit', 'file-list', 'empty-state', 'chat-messages',
        'question-input', 'send-btn', 'clear-chat', 'loading-overlay', 'loading-text'
    ];
    
    const missing = requiredElements.filter(id => !document.getElementById(id));
    
    if (missing.length > 0) {
        console.error('Missing required elements:', missing);
        return;
    }
    
    initializeApp();
    setupEventListeners();
});

async function initializeApp() {
    try {
        hideLoading(); // Make sure loading is hidden initially
        await loadUploadedFiles();
        await loadChatHistory();
    } catch (error) {
        console.error('Error initializing app:', error);
        hideLoading();
    }
}

function setupEventListeners() {
    // Upload modal
    uploadBtn.addEventListener('click', () => {
        uploadModal.style.display = 'block';
    });

    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            uploadModal.style.display = 'none';
            resetUploadForm();
        });
    });

    // Click outside modal to close
    uploadModal.addEventListener('click', (e) => {
        if (e.target === uploadModal) {
            uploadModal.style.display = 'none';
            resetUploadForm();
        }
    });

    // File input and drag & drop
    fileDropZone.addEventListener('click', () => {
        pdfInput.click();
    });

    // Mobile-friendly drag and drop
    fileDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileDropZone.classList.add('dragover');
    });

    fileDropZone.addEventListener('dragleave', () => {
        fileDropZone.classList.remove('dragover');
    });

    fileDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        fileDropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type === 'application/pdf') {
            pdfInput.files = files;
            handleFileSelection(files[0]);
        } else {
            showToast('Please select a valid PDF file', 'error');
        }
    });

    // Touch events for mobile
    fileDropZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        pdfInput.click();
    });

    pdfInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelection(e.target.files[0]);
        }
    });

    removeFileBtn.addEventListener('click', () => {
        resetUploadForm();
    });

    // Upload form
    uploadForm.addEventListener('submit', handleUpload);

    // Chat functionality with mobile improvements
    questionInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleQuestionSubmit();
        }
    });

    // Prevent double-tap zoom on send button
    sendBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleQuestionSubmit();
    });

    sendBtn.addEventListener('click', handleQuestionSubmit);

    // Clear chat
    clearChatBtn.addEventListener('click', clearChatHistory);

    // Mobile keyboard handling
    if (isMobile()) {
        setupMobileKeyboardHandling();
    }
}

function handleFileSelection(file) {
    selectedFileDiv.style.display = 'flex';
    fileName.textContent = file.name;
    uploadSubmitBtn.disabled = false;
    fileDropZone.style.display = 'none';
}

function resetUploadForm() {
    uploadForm.reset();
    selectedFileDiv.style.display = 'none';
    fileDropZone.style.display = 'block';
    uploadSubmitBtn.disabled = true;
}

async function handleUpload(e) {
    e.preventDefault();
    
    const formData = new FormData();
    const file = pdfInput.files[0];
    
    if (!file) {
        showToast('Please select a file', 'error');
        return;
    }

    formData.append('pdf', file);
    
    showLoading('Processing PDF...');
    
    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast(data.message, 'success');
            uploadModal.style.display = 'none';
            resetUploadForm();
            loadUploadedFiles();
            enableChatInput();
        } else {
            showToast(data.error || 'Upload failed', 'error');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showToast('Upload failed. Please try again.', 'error');
    } finally {
        hideLoading();
    }
}

async function loadUploadedFiles() {
    try {
        const response = await fetch('/get_files');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        uploadedFiles = data.files || [];
        renderFileList();
    } catch (error) {
        console.error('Error loading files:', error);
        uploadedFiles = [];
        renderFileList();
        showToast('Error loading files', 'error');
    }
}

function renderFileList() {
    if (uploadedFiles.length === 0) {
        emptyState.style.display = 'block';
        fileList.innerHTML = '';
        fileList.appendChild(emptyState);
        disableChatInput();
    } else {
        emptyState.style.display = 'none';
        fileList.innerHTML = '';
        
        uploadedFiles.forEach(file => {
            const fileItem = createFileItem(file);
            fileList.appendChild(fileItem);
        });
        
        enableChatInput();
    }
}

function createFileItem(file) {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    fileItem.innerHTML = `
        <div class="file-info">
            <i class="fas fa-file-pdf"></i>
            <div class="file-details">
                <h4>${file.name}</h4>
                <small>${formatFileSize(file.size)} • ${formatDate(file.upload_date)}</small>
            </div>
        </div>
        <div class="file-actions">
            <button class="btn btn-danger" onclick="deleteFile('${file.id}')">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
    return fileItem;
}

async function deleteFile(fileId) {
    if (!confirm('Are you sure you want to delete this file?')) {
        return;
    }

    showLoading('Deleting file...');
    
    try {
        const response = await fetch('/delete_file', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ file_id: fileId })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('File deleted successfully', 'success');
            loadUploadedFiles();
        } else {
            showToast(data.error || 'Delete failed', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showToast('Delete failed. Please try again.', 'error');
    } finally {
        hideLoading();
    }
}

async function loadChatHistory() {
    try {
        const response = await fetch('/get_chat_history');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        chatHistory = data.history || [];
        renderChatHistory();
    } catch (error) {
        console.error('Error loading chat history:', error);
        chatHistory = [];
        renderChatHistory();
    }
}

function renderChatHistory() {
    // Clear existing messages except welcome message
    const welcomeMessage = chatMessages.querySelector('.welcome-message');
    chatMessages.innerHTML = '';
    chatMessages.appendChild(welcomeMessage);
    
    // Render chat history
    chatHistory.forEach(item => {
        addMessageToChat(item.question, 'user');
        addMessageToChat(item.answer, 'bot');
    });
    
    scrollToBottom();
}

async function handleQuestionSubmit() {
    const question = questionInput.value.trim();
    
    if (!question) {
        return;
    }
    
    if (uploadedFiles.length === 0) {
        showToast('Please upload at least one PDF first', 'error');
        return;
    }
    
    // Add user message to chat
    addMessageToChat(question, 'user');
    questionInput.value = '';
    
    // Show typing indicator
    const typingIndicator = addTypingIndicator();
    
    try {
        const response = await fetch('/ask', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ question: question })
        });
        
        const data = await response.json();
        
        // Remove typing indicator
        typingIndicator.remove();
        
        if (response.ok) {
            addMessageToChat(data.answer, 'bot');
        } else {
            addMessageToChat(data.error || 'Sorry, I encountered an error processing your question.', 'bot', 'error');
        }
    } catch (error) {
        console.error('Question error:', error);
        typingIndicator.remove();
        addMessageToChat('Sorry, I encountered an error processing your question.', 'bot', 'error');
    }
}

function addMessageToChat(message, sender, type = 'normal') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message ${type}`;
    
    const avatar = document.createElement('div');
    avatar.className = `${sender}-avatar`;
    avatar.innerHTML = sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = `<p>${message}</p>`;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

function addTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot-message typing-indicator';
    typingDiv.innerHTML = `
        <div class="bot-avatar">
            <i class="fas fa-robot"></i>
        </div>
        <div class="message-content">
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    
    chatMessages.appendChild(typingDiv);
    scrollToBottom();
    
    return typingDiv;
}

async function clearChatHistory() {
    if (!confirm('Are you sure you want to clear the chat history?')) {
        return;
    }
    
    try {
        const response = await fetch('/clear_chat');
        const data = await response.json();
        
        if (response.ok) {
            chatHistory = [];
            renderChatHistory();
            showToast('Chat history cleared', 'success');
        } else {
            showToast('Failed to clear chat history', 'error');
        }
    } catch (error) {
        console.error('Clear chat error:', error);
        showToast('Failed to clear chat history', 'error');
    }
}

function enableChatInput() {
    questionInput.disabled = false;
    sendBtn.disabled = false;
    questionInput.placeholder = 'Ask a question about your documents...';
}

function disableChatInput() {
    questionInput.disabled = true;
    sendBtn.disabled = true;
    questionInput.placeholder = 'Upload a PDF to start asking questions...';
}

function scrollToBottom() {
    if (isMobile()) {
        chatMessages.scrollTo({
            top: chatMessages.scrollHeight,
            behavior: 'smooth'
        });
    } else {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

function showLoading(text = 'Loading...') {
    console.log('Showing loading:', text);
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    
    if (loadingOverlay && loadingText) {
        loadingText.textContent = text;
        loadingOverlay.style.display = 'flex';
    } else {
        console.error('Loading elements not found');
    }
}

function hideLoading() {
    console.log('Hiding loading');
    const loadingOverlay = document.getElementById('loading-overlay');
    
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    } else {
        console.error('Loading overlay element not found');
    }
}

function showToast(message, type = 'info') {
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-triangle' : 'info'}"></i>
            <span>${message}</span>
        </div>
    `;
    
    // Add to body
    document.body.appendChild(toast);
    
    // Show toast
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    // Remove toast after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// Utility functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

// Mobile utility functions
function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           window.innerWidth <= 768;
}

function setupMobileKeyboardHandling() {
    let initialViewportHeight = window.innerHeight;
    
    // Handle virtual keyboard on mobile
    window.addEventListener('resize', () => {
        const currentHeight = window.innerHeight;
        const keyboardHeight = initialViewportHeight - currentHeight;
        
        if (keyboardHeight > 150) { // Keyboard is likely open
            document.body.classList.add('keyboard-open');
            // Scroll to bottom when keyboard opens
            setTimeout(() => {
                scrollToBottom();
            }, 100);
        } else {
            document.body.classList.remove('keyboard-open');
        }
    });

    // Focus handling for mobile
    questionInput.addEventListener('focus', () => {
        setTimeout(() => {
            scrollToBottom();
        }, 300);
    });
}

function handleMobileScroll() {
    // Smooth scroll to bottom on mobile
    if (isMobile()) {
        chatMessages.scrollTo({
            top: chatMessages.scrollHeight,
            behavior: 'smooth'
        });
    } else {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// Add CSS for toast notifications and typing indicator
const additionalCSS = `
.toast {
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 1rem 1.5rem;
    transform: translateX(400px);
    transition: transform 0.3s ease;
    z-index: 3000;
    max-width: 300px;
}

.toast.show {
    transform: translateX(0);
}

.toast-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.toast-success {
    border-left: 4px solid var(--success-color);
}

.toast-error {
    border-left: 4px solid var(--danger-color);
}

.toast-info {
    border-left: 4px solid var(--primary-color);
}

.typing-indicator .message-content {
    padding: 1rem 1.25rem;
}

.typing-dots {
    display: flex;
    gap: 4px;
}

.typing-dots span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-secondary);
    animation: typing 1.4s infinite ease-in-out;
}

.typing-dots span:nth-child(1) {
    animation-delay: -0.32s;
}

.typing-dots span:nth-child(2) {
    animation-delay: -0.16s;
}

@keyframes typing {
    0%, 80%, 100% {
        transform: scale(0.8);
        opacity: 0.5;
    }
    40% {
        transform: scale(1);
        opacity: 1;
    }
}
`;

// Inject additional CSS
const style = document.createElement('style');
style.textContent = additionalCSS;
document.head.appendChild(style);
