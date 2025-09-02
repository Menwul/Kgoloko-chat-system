// static/js/chat.js
document.addEventListener('DOMContentLoaded', function() {
    console.log('Chat interface loaded');

    // Chat functionality
    const messageForm = document.getElementById('message-form');
    const messageInput = document.getElementById('message-input');
    const chatMessages = document.getElementById('chat-messages');
    const roomList = document.getElementById('room-list');
    const roomLinks = document.querySelectorAll('.room-link');
    const currentRoomElement = document.getElementById('current-room');
    const onlineUsersList = document.getElementById('online-users-list');
    const onlineCountElement = document.getElementById('online-count');
    const userCountElement = document.getElementById('user-count');
    const searchToggle = document.getElementById('search-toggle');
    const searchBox = document.getElementById('search-box');
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const sendButton = document.getElementById('send-button');
    
    // File upload elements
    let fileUploadBtn, imageUpload, videoUpload, audioUpload, documentUpload, filePreview, fileName, removeFileBtn;
    let voiceRecorder, startRecordingBtn, stopRecordingBtn, recordingTimer, recordedAudio;
    
    try {
        fileUploadBtn = document.getElementById('file-upload-btn');
        imageUpload = document.getElementById('image-upload');
        videoUpload = document.getElementById('video-upload');
        audioUpload = document.getElementById('audio-upload');
        documentUpload = document.getElementById('document-upload');
        filePreview = document.getElementById('file-preview');
        fileName = document.getElementById('file-name');
        removeFileBtn = document.getElementById('remove-file');
        voiceRecorder = document.getElementById('voice-recorder');
        startRecordingBtn = document.getElementById('start-recording');
        stopRecordingBtn = document.getElementById('stop-recording');
        recordingTimer = document.getElementById('recording-timer');
        recordedAudio = document.getElementById('recorded-audio');
    } catch (e) {
        console.error('Error accessing DOM elements:', e);
    }
    
    // Modal elements
    const imageModal = new bootstrap.Modal(document.getElementById('imageModal'));
    const modalImage = document.getElementById('modal-image');
    const downloadModalImageBtn = document.getElementById('download-modal-image');
    
    let currentRoom = null;
    let messagePolling = null;
    let currentUsername = document.body.dataset.username || "{{ username }}";
    let currentFile = null;
    let currentFileType = null;
    let currentModalImageUrl = null;
    
    // Debug room links
    console.log('Found room links:', roomLinks.length);
    roomLinks.forEach(link => console.log('Room link:', link.dataset.room));

    // Function to load messages for a room
    function loadMessages(room) {
        console.log('Loading messages for room:', room);
        
        chatMessages.innerHTML = `
            <div class="text-center text-muted mt-5">
                <div class="spinner-border text-primary mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p>Loading messages...</p>
            </div>
        `;
        
        fetch(`/get_messages/${room}?limit=50`)
            .then(response => {
                if (response.status === 403) throw new Error('Access denied to this room');
                if (response.status === 404) throw new Error('Room not found');
                if (!response.ok) throw new Error('Network response was not ok');
                return response.json();
            })
            .then(messages => {
                chatMessages.innerHTML = '';
                
                if (messages.error) throw new Error(messages.error);
                
                if (messages.length === 0) {
                    chatMessages.innerHTML = `
                        <div class="text-center text-muted mt-5">
                            <i class="fas fa-comments fa-3x mb-3"></i>
                            <p>No messages yet. Start the conversation!</p>
                        </div>
                    `;
                } else {
                    messages.forEach(message => addMessageToChat(message));
                    setTimeout(addMediaEventListeners, 100);
                }
                
                chatMessages.scrollTop = chatMessages.scrollHeight;
            })
            .catch(error => {
                console.error('Error loading messages:', error);
                chatMessages.innerHTML = `
                    <div class="text-center text-muted mt-5">
                        <i class="fas fa-exclamation-triangle fa-3x mb-3 text-warning"></i>
                        <h5>${error.message === 'Access denied to this room' ? 'Access Denied' : error.message === 'Room not found' ? 'Room Not Found' : 'Loading Error'}</h5>
                        <p>${error.message === 'Access denied to this room' ? 'You don\'t have permission to view this room.' : error.message === 'Room not found' ? 'The requested room does not exist.' : 'Error loading messages. Please try again.'}</p>
                        <button class="btn btn-outline-primary mt-2" onclick="loadMessages('${room}')">
                            <i class="fas fa-redo me-1"></i> Retry
                        </button>
                    </div>
                `;
                messageInput.disabled = true;
                sendButton.disabled = true;
                if (fileUploadBtn) fileUploadBtn.disabled = true;
                if (imageUpload) imageUpload.disabled = true;
                if (videoUpload) videoUpload.disabled = true;
                if (audioUpload) audioUpload.disabled = true;
                if (documentUpload) documentUpload.disabled = true;
            });
    }
    
    // Function to add a message to the chat
    function addMessageToChat(message) {
        const isCurrentUser = message.username === currentUsername || "{{ role }}" === 'admin';
        const messageClass = message.username === currentUsername ? 'message-sent' : 'message-received';
        
        const messageElement = document.createElement('div');
        messageElement.classList.add('message-bubble', messageClass);
        messageElement.setAttribute('data-message-id', message.id);
        
        let messageContent = '';
        let mediaUrl = message.message || message.file_path || '';
        
        if (mediaUrl && !mediaUrl.startsWith('/') && !mediaUrl.startsWith('http') && !mediaUrl.startsWith('blob:')) {
            mediaUrl = '/' + mediaUrl;
        }
        
        if (message.message_type === 'image') {
            messageContent = `
                <div class="media-container">
                    <img src="${mediaUrl}" alt="Shared image" class="img-fluid" data-media-url="${mediaUrl}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block'">
                    <button class="media-download-btn" data-media-url="${mediaUrl}" data-media-type="image">
                        <i class="fas fa-download"></i>
                    </button>
                    <div class="alert alert-warning mt-2 d-none">Image failed to load. <a href="${mediaUrl}" download>Download instead</a></div>
                </div>
            `;
        } else if (message.message_type === 'video') {
            messageContent = `
                <div class="media-container">
                    <video controls class="img-fluid" data-media-url="${mediaUrl}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block'">
                        <source src="${mediaUrl}" type="video/mp4">
                        Your browser does not support the video tag.
                    </video>
                    <button class="media-download-btn" data-media-url="${mediaUrl}" data-media-type="video">
                        <i class="fas fa-download"></i>
                    </button>
                    <div class="alert alert-warning mt-2 d-none">Video failed to load. <a href="${mediaUrl}" download>Download instead</a></div>
                </div>
            `;
        } else if (message.message_type === 'audio') {
            messageContent = `
                <div class="media-container">
                    <audio controls class="media-audio-player" data-media-url="${mediaUrl}" onerror="handleAudioError(this)">
                        <source src="${mediaUrl}" type="audio/mpeg">
                        <source src="${mediaUrl}" type="audio/wav">
                        <source src="${mediaUrl}" type="audio/ogg">
                        Your browser does not support the audio element.
                    </audio>
                    <div class="audio-controls">
                        <button class="btn btn-sm btn-outline-primary media-download-btn audio-download-btn" data-media-url="${mediaUrl}" data-media-type="audio">
                            <i class="fas fa-download me-1"></i> Download
                        </button>
                    </div>
                    <div class="alert alert-warning mt-2 d-none">Audio failed to load. <a href="${mediaUrl}" download>Download instead</a></div>
                </div>
            `;
        } else if (message.message_type === 'document') {
            const fileName = mediaUrl.split('/').pop();
            const fileExtension = fileName.split('.').pop().toLowerCase();
            const iconClass = fileExtension === 'pdf' ? 'fas fa-file-pdf' :
                            (fileExtension === 'txt' ? 'fas fa-file-alt' :
                            (fileExtension === 'doc' || fileExtension === 'docx' ? 'fas fa-file-word' : 'fas fa-file'));
            messageContent = `
                <div class="document-container">
                    <i class="${iconClass} document-icon"></i>
                    <a href="${mediaUrl}" download class="text-decoration-none">${fileName}</a>
                    <button class="btn btn-sm btn-outline-primary media-download-btn document-download-btn" data-media-url="${mediaUrl}" data-media-type="document">
                        <i class="fas fa-download me-1"></i> Download
                    </button>
                </div>
                <div class="alert alert-warning mt-2 d-none document-fallback">Document failed to load. <a href="${mediaUrl}" download>Download instead</a></div>
            `;
        } else {
            messageContent = `<div class="message-content">${escapeHtml(message.message)}</div>`;
        }
        
        const editedIndicator = message.is_edited ? 
            `<small class="text-muted d-block mt-1"><i class="fas fa-edit me-1"></i>Edited at ${formatTime(message.edited_at)}</small>` : '';
        
        let replyContent = '';
        if (message.reply_to) {
            replyContent = `
                <div class="reply-reference bg-light p-2 rounded mb-2">
                    <small class="text-muted">Replying to ${message.reply_username || 'a message'}</small>
                    <div class="reply-preview text-truncate">${message.reply_preview || 'Previous message'}</div>
                </div>
            `;
        }
        
        messageElement.innerHTML = `
            <div class="d-flex justify-content-between align-items-start mb-1">
                <strong>${isCurrentUser ? 'You' : escapeHtml(message.username)}</strong>
                <small class="message-time">${formatTime(message.timestamp)}</small>
            </div>
            ${replyContent}
            ${messageContent}
            ${editedIndicator}
            <div class="message-actions mt-2">
                <button class="btn btn-sm btn-outline-secondary reply-btn" data-message-id="${message.id}">
                    <i class="fas fa-reply"></i>
                </button>
                ${isCurrentUser ? `
                <button class="btn btn-sm btn-outline-primary edit-btn ${message.message_type !== 'text' ? 'd-none' : ''}" data-message-id="${message.id}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger delete-btn" data-message-id="${message.id}">
                    <i class="fas fa-trash"></i>
                </button>
                ` : ''}
            </div>
        `;
        
        chatMessages.appendChild(messageElement);
        
        const replyBtn = messageElement.querySelector('.reply-btn');
        if (replyBtn) {
            replyBtn.addEventListener('click', function() {
                const messageId = this.getAttribute('data-message-id');
                handleReply(messageId);
            });
        }
        
        if (isCurrentUser) {
            const editBtn = messageElement.querySelector('.edit-btn');
            const deleteBtn = messageElement.querySelector('.delete-btn');
            
            if (editBtn && message.message_type === 'text') {
                editBtn.addEventListener('click', function() {
                    const messageId = this.getAttribute('data-message-id');
                    handleEdit(messageId);
                });
            }
            
            if (deleteBtn) {
                deleteBtn.addEventListener('click', function() {
                    const messageId = this.getAttribute('data-message-id');
                    handleDelete(messageId);
                });
            }
        }
    }
    
    // Handle audio errors
    function handleAudioError(audioElement) {
        console.error('Audio loading error:', audioElement.src);
        const container = audioElement.closest('.media-container');
        const fallback = container.querySelector('.alert');
        if (fallback) fallback.classList.remove('d-none');
        
        if (audioElement.src && !audioElement.src.startsWith('http') && !audioElement.src.startsWith('/') && !audioElement.src.startsWith('blob:')) {
            audioElement.src = '/' + audioElement.src;
            audioElement.load();
        }
    }
    
    // Add event listeners for media elements
    function addMediaEventListeners() {
        document.querySelectorAll('.media-container img').forEach(img => {
            img.removeEventListener('click', handleImageClick);
            img.addEventListener('click', handleImageClick);
        });
        
        document.querySelectorAll('.media-download-btn').forEach(btn => {
            btn.removeEventListener('click', handleDownloadClick);
            btn.addEventListener('click', handleDownloadClick);
        });
        
        document.querySelectorAll('audio').forEach(audio => {
            audio.load();
            audio.addEventListener('error', function() { handleAudioError(this); });
            audio.addEventListener('canplay', function() { console.log('Audio can play:', this.src); });
        });
    }
    
    function handleImageClick() {
        const mediaUrl = this.getAttribute('data-media-url');
        if (mediaUrl) {
            modalImage.src = mediaUrl;
            currentModalImageUrl = mediaUrl;
            imageModal.show();
        }
    }
    
    function handleDownloadClick(e) {
        e.stopPropagation();
        const mediaUrl = this.getAttribute('data-media-url');
        const mediaType = this.getAttribute('data-media-type');
        if (mediaUrl) downloadMedia(mediaUrl, mediaType);
    }
    
    function downloadMedia(url, type) {
        if (!url) {
            console.error('No URL provided for download');
            return;
        }
        
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        let extension = type === 'audio' ? 'mp3' : type;
        if (type === 'document') {
            extension = url.split('.').pop().toLowerCase();
        }
        a.download = `kgoloko_${type}_${timestamp}.${extension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
    
    function handleReply(messageId) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageElement) return;
        
        const username = messageElement.querySelector('strong').textContent;
        const messageContent = messageElement.querySelector('.message-content')?.textContent || '[Media message]';
        
        messageInput.value = `@${username} `;
        messageInput.focus();
        messageInput.setAttribute('data-reply-to', messageId);
        
        const replyIndicator = document.createElement('div');
        replyIndicator.id = 'reply-indicator';
        replyIndicator.className = 'alert alert-info py-2 mb-2';
        replyIndicator.innerHTML = `
            Replying to <strong>${username}</strong>: ${truncateText(messageContent, 50)}
            <button type="button" class="btn-close float-end" onclick="cancelReply()"></button>
        `;
        
        const existingIndicator = document.getElementById('reply-indicator');
        if (existingIndicator) existingIndicator.remove();
        
        chatMessages.parentNode.insertBefore(replyIndicator, chatMessages.nextSibling);
    }
    
    function cancelReply() {
        messageInput.removeAttribute('data-reply-to');
        const replyIndicator = document.getElementById('reply-indicator');
        if (replyIndicator) replyIndicator.remove();
    }
    
    function handleEdit(messageId) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageElement) return;
        
        const messageContent = messageElement.querySelector('.message-content');
        if (!messageContent) {
            alert('Cannot edit media messages');
            return;
        }
        
        const originalText = messageContent.textContent;
        
        const editForm = document.createElement('form');
        editForm.innerHTML = `
            <div class="input-group">
                <input type="text" class="form-control" value="${originalText}" id="edit-input-${messageId}">
                <button class="btn btn-success" type="submit">Save</button>
                <button class="btn btn-secondary" type="button" onclick="cancelEdit('${messageId}')">Cancel</button>
            </div>
        `;
        
        messageContent.replaceWith(editForm);
        
        const editInput = document.getElementById(`edit-input-${messageId}`);
        editInput.focus();
        editInput.select();
        
        editForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveEdit(messageId, editInput.value);
        });
    }
    
    function saveEdit(messageId, newText) {
        if (!newText.trim()) {
            alert('Message cannot be empty');
            return;
        }
        
        fetch('/edit_message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message_id: messageId, new_message: newText })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                loadMessages(currentRoom);
            } else {
                alert('Error editing message: ' + (data.error || 'Unknown error'));
            }
        })
        .catch(error => {
            console.error('Error editing message:', error);
            alert('Error editing message. Please try again.');
        });
    }
    
    function cancelEdit(messageId) {
        loadMessages(currentRoom);
    }
    
    function handleDelete(messageId) {
        if (!confirm('Are you sure you want to delete this message?')) return;
        
        fetch('/delete_message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message_id: messageId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
                if (messageElement) messageElement.remove();
            } else {
                alert('Error deleting message: ' + (data.error || 'Unknown error'));
            }
        })
        .catch(error => {
            console.error('Error deleting message:', error);
            alert('Error deleting message. Please try again.');
        });
    }
    
    function formatTime(timestamp) {
        try {
            return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return timestamp;
        }
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function truncateText(text, maxLength) {
        return text.length <= maxLength ? text : text.substring(0, maxLength) + '...';
    }
    
    function updateOnlineUsers() {
        fetch('/get_online_users')
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok');
                return response.json();
            })
            .then(users => {
                onlineUsersList.innerHTML = '';
                onlineCountElement.textContent = users.length;
                
                const otherUsers = users.filter(user => user.username !== currentUsername);
                userCountElement.textContent = `${otherUsers.length + 1} users`;
                
                const currentUserElement = document.createElement('div');
                currentUserElement.classList.add('d-flex', 'align-items-center', 'mb-2');
                currentUserElement.innerHTML = `
                    <span class="online-indicator"></span>
                    You (${document.body.dataset.role || 'user'})
                `;
                onlineUsersList.appendChild(currentUserElement);
                
                otherUsers.forEach(user => {
                    const userElement = document.createElement('div');
                    userElement.classList.add('d-flex', 'align-items-center', 'mb-2');
                    userElement.innerHTML = `
                        <span class="online-indicator"></span>
                        ${escapeHtml(user.username)} <span class="badge bg-secondary ms-2">${user.role}</span>
                    `;
                    onlineUsersList.appendChild(userElement);
                });
            })
            .catch(error => console.error('Error fetching online users:', error));
    }
    
    // Handle room selection
    function selectRoom(link) {
        console.log('Room clicked:', link.dataset.room);
        roomLinks.forEach(r => r.classList.remove('active'));
        link.classList.add('active');
        
        currentRoom = link.dataset.room;
        const roomName = link.querySelector('i').nextSibling.textContent.trim();
        const roomDescription = link.querySelector('small').textContent;
        currentRoomElement.textContent = `${roomName} - ${roomDescription}`;
        
        messageInput.disabled = false;
        sendButton.disabled = false;
        if (fileUploadBtn) fileUploadBtn.disabled = false;
        if (imageUpload) imageUpload.disabled = false;
        if (videoUpload) videoUpload.disabled = false;
        if (audioUpload) audioUpload.disabled = false;
        if (documentUpload) documentUpload.disabled = false;
        
        loadMessages(currentRoom);
        
        if (messagePolling) clearInterval(messagePolling);
        messagePolling = setInterval(() => {
            if (!currentRoom) return;
            fetch(`/get_messages/${currentRoom}?limit=1`)
                .then(response => response.json())
                .then(messages => {
                    if (messages.length > 0) {
                        const lastMessage = messages[messages.length - 1];
                        const existingMessages = chatMessages.querySelectorAll('.message-bubble');
                        const lastDisplayed = existingMessages[existingMessages.length - 1];
                        
                        if (!lastDisplayed || 
                            !lastDisplayed.querySelector('.message-time').textContent.includes(
                                formatTime(lastMessage.timestamp))) {
                            addMessageToChat(lastMessage);
                            chatMessages.scrollTop = chatMessages.scrollHeight;
                            addMediaEventListeners();
                        }
                    }
                })
                .catch(error => console.error('Error polling for messages:', error));
        }, 3000);
    }
    
    // Attach room selection listeners
    roomLinks.forEach(link => {
        link.removeEventListener('click', selectRoom); // Prevent duplicate listeners
        link.addEventListener('click', function(e) {
            e.preventDefault();
            selectRoom(this);
        });
    });
    
    // Handle message submission
    messageForm.addEventListener('submit', function(e) {
        e.preventDefault();
        if (!currentRoom) {
            alert('Please select a room to send a message.');
            return;
        }
        
        if (messageInput.value.trim() === '' && !currentFile) {
            alert('Please enter a message or select a file.');
            return;
        }
        
        const formData = new FormData();
        formData.append('room', currentRoom);
        formData.append('message_type', currentFileType || 'text');
        
        if (currentFile) {
            formData.append('file', currentFile);
            if (messageInput.value.trim()) formData.append('message', messageInput.value.trim());
        } else {
            formData.append('message', messageInput.value.trim());
        }
        
        const replyTo = messageInput.getAttribute('data-reply-to');
        if (replyTo) {
            formData.append('reply_to', replyTo);
            cancelReply();
        }
        
        fetch('/send_message', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw new Error(err.error || 'Network response was not ok'); });
            }
            return response.json();
        })
        .then(data => {
            if (data.status === 'success') {
                messageInput.value = '';
                if (currentFile) clearFileSelection();
                addMessageToChat(data);
                chatMessages.scrollTop = chatMessages.scrollHeight;
                addMediaEventListeners();
            } else {
                alert('Error sending message: ' + (data.error || 'Unknown error'));
            }
        })
        .catch(error => {
            console.error('Error sending message:', error);
            alert('Error sending message: ' + error.message);
        });
    });
    
    // File upload handling
    if (fileUploadBtn && imageUpload && videoUpload && audioUpload && documentUpload && filePreview && fileName && removeFileBtn) {
        function handleFileUpload(file, type) {
            currentFile = file;
            currentFileType = type;
            fileName.textContent = file.name;
            filePreview.classList.remove('d-none');
            sendButton.disabled = false;
        }
        
        function clearFileSelection() {
            currentFile = null;
            currentFileType = null;
            filePreview.classList.add('d-none');
            imageUpload.value = '';
            videoUpload.value = '';
            audioUpload.value = '';
            documentUpload.value = '';
            if (recordedAudio) recordedAudio.classList.add('d-none');
            if (voiceRecorder) voiceRecorder.classList.add('d-none');
        }
        
        imageUpload.addEventListener('change', function(e) {
            if (this.files.length > 0) handleFileUpload(this.files[0], 'image');
        });
        
        videoUpload.addEventListener('change', function(e) {
            if (this.files.length > 0) handleFileUpload(this.files[0], 'video');
        });
        
        audioUpload.addEventListener('change', function(e) {
            if (this.files.length > 0) handleFileUpload(this.files[0], 'audio');
        });
        
        documentUpload.addEventListener('change', function(e) {
            if (this.files.length > 0) handleFileUpload(this.files[0], 'document');
        });
        
        removeFileBtn.addEventListener('click', clearFileSelection);
    }
    
    // Voice recording functionality
    // Voice recording functionality
if (voiceRecorder && startRecordingBtn && stopRecordingBtn && recordingTimer && recordedAudio) {
    let mediaRecorder = null;
    let audioChunks = [];
    let recordingInterval = null;
    let recordingSeconds = 0;

    startRecordingBtn.addEventListener('click', function() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(function(stream) {
                    mediaRecorder = new MediaRecorder(stream);
                    audioChunks = [];

                    mediaRecorder.ondataavailable = function(e) { audioChunks.push(e.data); };

                    mediaRecorder.onstop = function() {
                        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                        const file = new File([audioBlob], 'voice_recording.wav', { type: 'audio/wav' });
                        currentFile = file;
                        currentFileType = 'audio';
                        fileName.textContent = file.name;
                        filePreview.classList.remove('d-none');

                        const audioURL = URL.createObjectURL(audioBlob);
                        recordedAudio.src = audioURL;
                        recordedAudio.classList.remove('d-none');

                        sendButton.disabled = false;

                        // Automatically submit the form with the recorded file
                        const formData = new FormData(messageForm);
                        formData.set('file', currentFile);
                        formData.set('message_type', currentFileType);
                        formData.set('room', currentRoom);

                        fetch('/send_message', {
                            method: 'POST',
                            body: formData
                        })
                        .then(response => {
                            if (!response.ok) {
                                return response.json().then(err => { throw new Error(err.error || 'Network response was not ok'); });
                            }
                            return response.json();
                        })
                        .then(data => {
                            if (data.status === 'success') {
                                clearFileSelection();
                                addMessageToChat(data);
                                chatMessages.scrollTop = chatMessages.scrollHeight;
                                addMediaEventListeners();
                            } else {
                                alert('Error sending voice message: ' + (data.error || 'Unknown error'));
                            }
                        })
                        .catch(error => {
                            console.error('Error sending voice message:', error);
                            alert('Error sending voice message: ' + error.message);
                        });
                    };

                    mediaRecorder.start();
                    startRecordingBtn.classList.add('d-none');
                    stopRecordingBtn.classList.remove('d-none');

                    recordingSeconds = 0;
                    recordingInterval = setInterval(function() {
                        recordingSeconds++;
                        const minutes = Math.floor(recordingSeconds / 60);
                        const seconds = recordingSeconds % 60;
                        recordingTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    }, 1000);
                })
                .catch(function(err) {
                    console.error('Error accessing microphone:', err);
                    alert('Cannot access microphone. Please check permissions.');
                });
        } else {
            alert('Your browser does not support audio recording.');
        }
    });

    stopRecordingBtn.addEventListener('click', function() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
            startRecordingBtn.classList.remove('d-none');
            stopRecordingBtn.classList.add('d-none');
            clearInterval(recordingInterval);
            recordingTimer.textContent = '00:00';
        }
    });

    document.querySelector('.dropdown-item[for="audio-upload"]').addEventListener('click', function(e) {
        e.preventDefault();
        voiceRecorder.classList.toggle('d-none');
    });
}

// Clear file selection function (unchanged)
function clearFileSelection() {
    currentFile = null;
    currentFileType = null;
    filePreview.classList.add('d-none');
    imageUpload.value = '';
    videoUpload.value = '';
    audioUpload.value = '';
    documentUpload.value = '';
    if (recordedAudio) recordedAudio.classList.add('d-none');
    if (voiceRecorder) voiceRecorder.classList.add('d-none');
}
    
    // Toggle search box
    if (searchToggle && searchBox) {
        searchToggle.addEventListener('click', function() {
            searchBox.classList.toggle('d-none');
        });
    }
    
    // Handle search
    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', function() {
            const query = searchInput.value.trim();
            if (query === '' || !currentRoom) return;
            
            fetch(`/search_messages?q=${encodeURIComponent(query)}&room=${currentRoom}`)
                .then(response => response.json())
                .then(results => {
                    chatMessages.innerHTML = '';
                    if (results.length === 0) {
                        chatMessages.innerHTML = `
                            <div class="text-center text-muted mt-5">
                                <i class="fas fa-search fa-3x mb-3"></i>
                                <p>No results found for "${query}"</p>
                            </div>
                        `;
                    } else {
                        results.forEach(message => addMessageToChat(message));
                        addMediaEventListeners();
                    }
                })
                .catch(error => console.error('Error searching messages:', error));
        });
    }
    
    // Download button in modal
    if (downloadModalImageBtn) {
        downloadModalImageBtn.addEventListener('click', function() {
            if (currentModalImageUrl) downloadMedia(currentModalImageUrl, 'image');
        });
    }
    
    // Initial update of online users
    updateOnlineUsers();
    setInterval(updateOnlineUsers, 10000);
});