// static/js/chat.js
document.addEventListener('DOMContentLoaded', function() {
    console.log('Chat interface loaded');
    
    // Chat functionality
    const messageForm = document.getElementById('message-form');
    const messageInput = document.getElementById('message-input');
    const chatMessages = document.getElementById('chat-messages');
    const roomLinks = document.querySelectorAll('.room-link');
    const currentRoomElement = document.getElementById('current-room');
    const onlineUsersList = document.getElementById('online-users-list');
    const onlineCountElement = document.getElementById('online-count');
    const userCountElement = document.getElementById('user-count');
    const searchToggle = document.getElementById('search-toggle');
    const searchBox = document.getElementById('search-box');
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    
    // Check if file upload elements exist before using them
    let fileUploadBtn, imageUpload, videoUpload, audioUpload, filePreview, fileName, removeFileBtn;
    let voiceRecorder, startRecordingBtn, stopRecordingBtn, recordingTimer, recordedAudio;
    
    try {
        fileUploadBtn = document.getElementById('file-upload-btn');
        imageUpload = document.getElementById('image-upload');
        videoUpload = document.getElementById('video-upload');
        audioUpload = document.getElementById('audio-upload');
        filePreview = document.getElementById('file-preview');
        fileName = document.getElementById('file-name');
        removeFileBtn = document.getElementById('remove-file');
        voiceRecorder = document.getElementById('voice-recorder');
        startRecordingBtn = document.getElementById('start-recording');
        stopRecordingBtn = document.getElementById('stop-recording');
        recordingTimer = document.getElementById('recording-timer');
        recordedAudio = document.getElementById('recorded-audio');
    } catch (e) {
        console.log('File upload elements not found:', e);
    }
    
    let currentRoom = null;
    let messagePolling = null;
    let currentUsername = document.body.dataset.username;
    let currentFile = null;
    let currentFileType = null;
    
   // Function to load messages for a room
function loadMessages(room) {
    console.log('Loading messages for room:', room);
    
    // Show loading indicator
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
            if (response.status === 403) {
                throw new Error('Access denied to this room');
            }
            if (response.status === 404) {
                throw new Error('Room not found');
            }
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(messages => {
            chatMessages.innerHTML = '';
            
            if (messages.error) {
                // Handle server-side errors
                throw new Error(messages.error);
            }
            
            if (messages.length === 0) {
                chatMessages.innerHTML = `
                    <div class="text-center text-muted mt-5">
                        <i class="fas fa-comments fa-3x mb-3"></i>
                        <p>No messages yet. Start the conversation!</p>
                    </div>
                `;
            } else {
                messages.forEach(message => {
                    addMessageToChat(message);
                });
                
                // Add event listeners for media elements after all messages are loaded
                setTimeout(() => {
                    addMediaEventListeners();
                }, 100);
            }
            
            chatMessages.scrollTop = chatMessages.scrollHeight;
        })
        .catch(error => {
            console.error('Error loading messages:', error);
            
            if (error.message === 'Access denied to this room') {
                chatMessages.innerHTML = `
                    <div class="text-center text-muted mt-5">
                        <i class="fas fa-ban fa-3x mb-3 text-danger"></i>
                        <h5>Access Denied</h5>
                        <p>You don't have permission to view this room.</p>
                        <button class="btn btn-primary mt-2" onclick="location.reload()">
                            <i class="fas fa-refresh me-1"></i> Refresh Page
                        </button>
                    </div>
                `;
                
                // Disable message input and file upload
                messageInput.disabled = true;
                sendButton.disabled = true;
                fileUploadBtn.disabled = true;
                imageUpload.disabled = true;
                videoUpload.disabled = true;
                audioUpload.disabled = true;
                
            } else if (error.message === 'Room not found') {
                chatMessages.innerHTML = `
                    <div class="text-center text-muted mt-5">
                        <i class="fas fa-door-closed fa-3x mb-3 text-warning"></i>
                        <h5>Room Not Found</h5>
                        <p>The requested room does not exist.</p>
                    </div>
                `;
            } else {
                chatMessages.innerHTML = `
                    <div class="text-center text-muted mt-5">
                        <i class="fas fa-exclamation-triangle fa-3x mb-3 text-warning"></i>
                        <h5>Loading Error</h5>
                        <p>Error loading messages. Please try again.</p>
                        <button class="btn btn-outline-primary mt-2" onclick="loadMessages('${currentRoom}')">
                            <i class="fas fa-redo me-1"></i> Retry
                        </button>
                    </div>
                `;
            }
        });
}

// Function to add a message to the chat with enhanced features
function addMessageToChat(message) {
    const isCurrentUser = message.username === currentUsername;
    const messageClass = isCurrentUser ? 'message-sent' : 'message-received';
    
    const messageElement = document.createElement('div');
    messageElement.classList.add('message-bubble', messageClass);
    messageElement.setAttribute('data-message-id', message.id);
    
    let messageContent = '';
    let mediaUrl = message.message || message.file_path || '';
    
    // Ensure media URLs have the correct path
    if (mediaUrl && !mediaUrl.startsWith('/') && !mediaUrl.startsWith('http') && !mediaUrl.startsWith('blob:')) {
        mediaUrl = '/' + mediaUrl;
    }
    
    // Handle different message types
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
    } else {
        messageContent = `<div class="message-content">${escapeHtml(message.message)}</div>`;
    }
    
    // Add edited indicator if message was edited
    const editedIndicator = message.is_edited ? 
        `<small class="text-muted d-block mt-1"><i class="fas fa-edit me-1"></i>Edited at ${formatTime(message.edited_at)}</small>` : '';
    
    // Add reply reference if this is a reply
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
        
        <!-- Message actions menu -->
        <div class="message-actions mt-2">
            <button class="btn btn-sm btn-outline-secondary reply-btn" data-message-id="${message.id}">
                <i class="fas fa-reply"></i>
            </button>
            ${isCurrentUser ? `
            <button class="btn btn-sm btn-outline-primary edit-btn" data-message-id="${message.id}">
                <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger delete-btn" data-message-id="${message.id}">
                <i class="fas fa-trash"></i>
            </button>
            ` : ''}
        </div>
    `;
    
    chatMessages.appendChild(messageElement);
    
    // Add event listeners for the message actions
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
        
        if (editBtn) {
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

// Function to handle reply to a message
function handleReply(messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) return;
    
    const username = messageElement.querySelector('strong').textContent;
    const messageContent = messageElement.querySelector('.message-content')?.textContent || 
                          '[Media message]';
    
    // Set up the reply in the input field
    messageInput.value = `@${username} `;
    messageInput.focus();
    
    // Store the reply reference
    messageInput.setAttribute('data-reply-to', messageId);
    
    // Show a visual indicator
    const replyIndicator = document.createElement('div');
    replyIndicator.id = 'reply-indicator';
    replyIndicator.className = 'alert alert-info py-2 mb-2';
    replyIndicator.innerHTML = `
        Replying to <strong>${username}</strong>: ${truncateText(messageContent, 50)}
        <button type="button" class="btn-close float-end" onclick="cancelReply()"></button>
    `;
    
    const existingIndicator = document.getElementById('reply-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    chatMessages.parentNode.insertBefore(replyIndicator, chatMessages.nextSibling);
}

// Function to cancel a reply
function cancelReply() {
    messageInput.removeAttribute('data-reply-to');
    const replyIndicator = document.getElementById('reply-indicator');
    if (replyIndicator) {
        replyIndicator.remove();
    }
}

// Function to handle message editing
function handleEdit(messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) return;
    
    const messageContent = messageElement.querySelector('.message-content');
    if (!messageContent) {
        alert('Cannot edit media messages');
        return;
    }
    
    const originalText = messageContent.textContent;
    
    // Replace message content with an edit form
    const editForm = document.createElement('form');
    editForm.innerHTML = `
        <div class="input-group">
            <input type="text" class="form-control" value="${originalText}" id="edit-input-${messageId}">
            <button class="btn btn-success" type="submit">Save</button>
            <button class="btn btn-secondary" type="button" onclick="cancelEdit('${messageId}')">Cancel</button>
        </div>
    `;
    
    messageContent.replaceWith(editForm);
    
    // Focus on the input field
    const editInput = document.getElementById(`edit-input-${messageId}`);
    editInput.focus();
    editInput.select();
    
    // Handle form submission
    editForm.addEventListener('submit', function(e) {
        e.preventDefault();
        saveEdit(messageId, editInput.value);
    });
}

// Function to save an edited message
function saveEdit(messageId, newText) {
    if (!newText.trim()) {
        alert('Message cannot be empty');
        return;
    }
    
    fetch('/edit_message', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            message_id: messageId,
            new_message: newText
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            // Reload messages to show the updated content
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

// Function to cancel editing
function cancelEdit(messageId) {
    // Reload messages to revert changes
    loadMessages(currentRoom);
}

// Function to handle message deletion
function handleDelete(messageId) {
    if (!confirm('Are you sure you want to delete this message?')) {
        return;
    }
    
    fetch('/delete_message', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            message_id: messageId
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            // Remove the message from the UI
            const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
            if (messageElement) {
                messageElement.remove();
            }
        } else {
            alert('Error deleting message: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error deleting message:', error);
        alert('Error deleting message. Please try again.');
    });
}

// Helper function to truncate text
function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// Update the message submission to handle replies
messageForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    // Check if we're replying to a message
    const replyTo = messageInput.getAttribute('data-reply-to');
    if (replyTo) {
        // Add the reply information to the form data
        const formData = new FormData(this);
        formData.append('reply_to', replyTo);
        
        // Clear the reply indicator
        cancelReply();
        
        // Submit the form with the reply data
        submitMessageForm(formData);
    } else {
        // Regular message submission
        submitMessageForm(new FormData(this));
    }
});

// Function to handle message form submission
function submitMessageForm(formData) {
    // Your existing message submission code here, but using the passed formData
    // Make sure to include the reply_to parameter if it exists
    
    fetch('/send_message', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        if (data.status === 'success') {
            messageInput.value = '';
            if (currentFile) {
                clearFileSelection();
            }
            // Add the sent message to the chat immediately
            addMessageToChat(data);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            addMediaEventListeners();
        } else {
            alert('Error sending message: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error sending message:', error);
        alert('Error sending message. Please check console for details.');
    });
}
    
    // Function to add a message to the chat
    function addMessageToChat(message) {
        const isCurrentUser = message.username === currentUsername;
        const messageClass = isCurrentUser ? 'message-sent' : 'message-received';
        
        const messageElement = document.createElement('div');
        messageElement.classList.add('message-bubble', messageClass);
        
        let messageContent = '';
        if (message.message_type === 'image') {
            messageContent = `<img src="${message.message}" class="img-fluid rounded" alt="Shared image" style="max-height: 300px;">`;
        } else if (message.message_type === 'video') {
            messageContent = `
                <video controls class="img-fluid rounded" style="max-height: 300px;">
                    <source src="${message.message}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            `;
        } else if (message.message_type === 'audio') {
            messageContent = `
                <audio controls class="w-100">
                    <source src="${message.message}" type="audio/mpeg">
                    Your browser does not support the audio element.
                </audio>
            `;
        } else {
            messageContent = `<div class="message-content">${escapeHtml(message.message)}</div>`;
        }
        
        messageElement.innerHTML = `
            <div class="d-flex justify-content-between align-items-start">
                <strong>${isCurrentUser ? 'You' : message.username}</strong>
                <small class="message-time">${formatTime(message.timestamp)}</small>
            </div>
            ${messageContent}
        `;
        
        chatMessages.appendChild(messageElement);
    }
    
    // Helper function to format time
    function formatTime(timestamp) {
        try {
            const date = new Date(timestamp);
            return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        } catch (e) {
            return timestamp;
        }
    }
    
    // Helper function to escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Function to update online users
    function updateOnlineUsers() {
        fetch('/get_online_users')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(users => {
                onlineUsersList.innerHTML = '';
                onlineCountElement.textContent = users.length;
                
                // Filter out current user from online users list
                const otherUsers = users.filter(user => user.username !== currentUsername);
                userCountElement.textContent = `${otherUsers.length + 1} users`; // +1 for current user
                
                // Add current user first
                const currentUserElement = document.createElement('div');
                currentUserElement.classList.add('d-flex', 'align-items-center', 'mb-2');
                currentUserElement.innerHTML = `
                    <span class="online-indicator"></span>
                    You (${document.body.dataset.role || 'user'})
                `;
                onlineUsersList.appendChild(currentUserElement);
                
                // Add other users
                otherUsers.forEach(user => {
                    const userElement = document.createElement('div');
                    userElement.classList.add('d-flex', 'align-items-center', 'mb-2');
                    userElement.innerHTML = `
                        <span class="online-indicator"></span>
                        ${user.username} <span class="badge bg-secondary ms-2">${user.role}</span>
                    `;
                    onlineUsersList.appendChild(userElement);
                });
            })
            .catch(error => {
                console.error('Error fetching online users:', error);
            });
    }
    
    // Handle room selection
    roomLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Update active room
            roomLinks.forEach(r => r.classList.remove('active'));
            this.classList.add('active');
            
            // Set current room
            currentRoom = this.dataset.room;
            const roomDescription = this.querySelector('small').textContent;
            currentRoomElement.textContent = roomDescription;
            
            // Enable message input
            messageInput.disabled = false;
            messageForm.querySelector('button').disabled = false;
            
            // Enable file upload if elements exist
            if (fileUploadBtn) fileUploadBtn.disabled = false;
            if (imageUpload) imageUpload.disabled = false;
            if (videoUpload) videoUpload.disabled = false;
            if (audioUpload) audioUpload.disabled = false;
            
            // Load messages for the room
            loadMessages(currentRoom);
            
            // Start polling for new messages
            if (messagePolling) {
                clearInterval(messagePolling);
            }
            
            messagePolling = setInterval(() => {
                if (!currentRoom) return;
                
                fetch(`/get_messages/${currentRoom}?limit=1`)
                    .then(response => response.json())
                    .then(messages => {
                        if (messages.length > 0) {
                            const lastMessage = messages[messages.length - 1];
                            // Check if this message is already displayed
                            const existingMessages = chatMessages.querySelectorAll('.message-bubble');
                            const lastDisplayed = existingMessages[existingMessages.length - 1];
                            
                            if (!lastDisplayed || 
                                !lastDisplayed.querySelector('.message-time').textContent.includes(
                                    formatTime(lastMessage.timestamp))) {
                                addMessageToChat(lastMessage);
                                chatMessages.scrollTop = chatMessages.scrollHeight;
                            }
                        }
                    })
                    .catch(error => {
                        console.error('Error polling for messages:', error);
                    });
            }, 3000);
        });
    });
    
    // Handle message submission
    messageForm.addEventListener('submit', function(e) {
        e.preventDefault();
        console.log('Submit button clicked');
        
        if ((messageInput.value.trim() === '' && !currentFile) || !currentRoom) {
            console.log('Cannot send: no message content or no room selected');
            return;
        }
        
        const formData = new FormData();
        formData.append('room', currentRoom);
        formData.append('message_type', currentFileType || 'text');
        
        if (currentFile) {
            formData.append('file', currentFile);
            // For file uploads, the message can be optional
            if (messageInput.value.trim()) {
                formData.append('message', messageInput.value.trim());
            }
        } else {
            formData.append('message', messageInput.value.trim());
        }
        
        console.log('Sending message to server');
        
        fetch('/send_message', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            console.log('Server response:', data);
            if (data.status === 'success') {
                messageInput.value = '';
                if (currentFile) {
                    clearFileSelection();
                }
                // Scroll to bottom after sending message
                setTimeout(() => {
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }, 100);
            } else {
                alert('Error sending message: ' + (data.error || 'Unknown error'));
            }
        })
        .catch(error => {
            console.error('Error sending message:', error);
            alert('Error sending message. Please check console for details.');
        });
    });
    
    // File upload handling functions (only if elements exist)
    if (fileUploadBtn && imageUpload && videoUpload && audioUpload && filePreview && fileName && removeFileBtn) {
        function handleFileUpload(file, type) {
            currentFile = file;
            currentFileType = type;
            fileName.textContent = file.name;
            filePreview.classList.remove('d-none');
            
            // Enable submit button if there's a file
            messageForm.querySelector('button').disabled = false;
        }
        
        function clearFileSelection() {
            currentFile = null;
            currentFileType = null;
            filePreview.classList.add('d-none');
            imageUpload.value = '';
            videoUpload.value = '';
            audioUpload.value = '';
            if (recordedAudio) recordedAudio.classList.add('d-none');
            if (voiceRecorder) voiceRecorder.classList.add('d-none');
        }
        
        imageUpload.addEventListener('change', function(e) {
            if (this.files.length > 0) {
                handleFileUpload(this.files[0], 'image');
            }
        });
        
        videoUpload.addEventListener('change', function(e) {
            if (this.files.length > 0) {
                handleFileUpload(this.files[0], 'video');
            }
        });
        
        audioUpload.addEventListener('change', function(e) {
            if (this.files.length > 0) {
                handleFileUpload(this.files[0], 'audio');
            }
        });
        
        removeFileBtn.addEventListener('click', clearFileSelection);
    }
    
    // Voice recording functionality (only if elements exist)
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
                        
                        mediaRecorder.ondataavailable = function(e) {
                            audioChunks.push(e.data);
                        };
                        
                        mediaRecorder.onstop = function() {
                            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                            currentFile = audioBlob;
                            currentFileType = 'audio';
                            fileName.textContent = 'Voice recording.wav';
                            filePreview.classList.remove('d-none');
                            
                            const audioURL = URL.createObjectURL(audioBlob);
                            recordedAudio.src = audioURL;
                            recordedAudio.classList.remove('d-none');
                            
                            // Enable submit button
                            messageForm.querySelector('button').disabled = false;
                        };
                        
                        mediaRecorder.start();
                        startRecordingBtn.classList.add('d-none');
                        stopRecordingBtn.classList.remove('d-none');
                        
                        // Start timer
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
                
                // Stop timer
                clearInterval(recordingInterval);
                recordingTimer.textContent = '00:00';
            }
        });
        
        // Toggle voice recorder
        document.querySelector('.dropdown-item[for="audio-upload"]').addEventListener('click', function(e) {
            e.preventDefault();
            voiceRecorder.classList.toggle('d-none');
        });
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
                        results.forEach(message => {
                            addMessageToChat(message);
                        });
                    }
                })
                .catch(error => {
                    console.error('Error searching messages:', error);
                });
        });
    }
    
    // Initial update of online users
    updateOnlineUsers();
    setInterval(updateOnlineUsers, 10000);
});