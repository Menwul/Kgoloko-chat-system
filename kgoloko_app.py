import os
from werkzeug.utils import secure_filename
from flask import Flask, render_template, request, redirect, url_for, session, jsonify, flash, send_from_directory
import sqlite3
from datetime import datetime, timedelta
import uuid
import json
import logging
from functools import wraps
import random

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'mp4', 'mov', 'avi', 'wav', 'mp3', 'ogg' , 'blob', 'pdf', 'txt', 'doc', 'docx'}

# Ensure the upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

app.secret_key = 'your-secure-secret-key-here'  # Change this to a secure random key
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=24)

# Helper function to generate a unique 7-digit ID
def generate_unique_id(cursor):
    while True:
        unique_id = random.randint(1000000, 9999999)  # Generate 7-digit number
        cursor.execute("SELECT 1 FROM users WHERE unique_id = ?", (unique_id,))
        if not cursor.fetchone():
            return unique_id

def get_file_type(filename):
    if not filename:
        return 'text'
    
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    
    if ext in {'png', 'jpg', 'jpeg', 'gif'}:
        return 'image'
    elif ext in {'mp4', 'mov', 'avi'}:
        return 'video'
    elif ext in {'wav', 'mp3', 'ogg'}:
        return 'audio'
    elif ext in {'pdf', 'txt', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar'}:
        return 'document'
    else:
        return 'text'

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Database setup
def init_db():
    conn = sqlite3.connect('chatdatabase.db')
    c = conn.cursor()
    
    # Create users table with unique_id column
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    if not c.fetchone():
        c.execute('''CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email TEXT UNIQUE,
            role TEXT NOT NULL CHECK(role IN ('student', 'teacher', 'parent', 'admin')),
            unique_id INTEGER UNIQUE,  -- New column for 7-digit ID
            approved BOOLEAN DEFAULT FALSE,
            banned BOOLEAN DEFAULT FALSE,
            ban_reason TEXT,
            banned_at DATETIME,
            banned_by INTEGER,
            reset_token TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME,
            is_online BOOLEAN DEFAULT FALSE,
            profile_picture TEXT DEFAULT 'default.png',
            FOREIGN KEY (banned_by) REFERENCES users(id)
        )''')
    
    # Add unique_id column to existing users table if it doesn't exist
    try:
        c.execute("SELECT unique_id FROM users LIMIT 1")
    except sqlite3.OperationalError:
        c.execute("ALTER TABLE users ADD COLUMN unique_id INTEGER UNIQUE")
        # Generate unique_id for existing users
        c.execute("SELECT id FROM users WHERE unique_id IS NULL")
        users = c.fetchall()
        for user in users:
            unique_id = generate_unique_id(c)
            c.execute("UPDATE users SET unique_id = ? WHERE id = ?", (unique_id, user[0]))
    
    # Create messages table
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'")
    if not c.fetchone():
        c.execute('''CREATE TABLE messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room TEXT NOT NULL,
            username TEXT NOT NULL,
            message TEXT NOT NULL,
            message_type TEXT DEFAULT 'text',
            file_path TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_edited BOOLEAN DEFAULT FALSE,
            edited_at DATETIME,
            reply_to INTEGER,
            FOREIGN KEY (reply_to) REFERENCES messages(id)
        )''')
    
    # Create rooms table
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='rooms'")
    if not c.fetchone():
        c.execute('''CREATE TABLE rooms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            allowed_roles TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )''')
    
    # Create user_settings table
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user_settings'")
    if not c.fetchone():
        c.execute('''CREATE TABLE user_settings (
            user_id INTEGER PRIMARY KEY,
            theme TEXT DEFAULT 'auto',
            notifications BOOLEAN DEFAULT TRUE,
            sound_effects BOOLEAN DEFAULT TRUE,
            font_size INTEGER DEFAULT 14,
            auto_login BOOLEAN DEFAULT FALSE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )''')
    
    # Insert default rooms
    default_rooms = [
        ('general', 'General discussion room', '["student", "teacher", "parent", "admin"]', 'system'),
        ('teachers_students', 'Teacher-Student discussions', '["teacher", "student"]', 'system'),
        ('parents_teachers', 'Parent-Teacher discussions', '["parent", "teacher"]', 'system'),
        ('admin', 'Administrative discussions', '["admin"]', 'system')
    ]
    
    for room in default_rooms:
        c.execute("SELECT id FROM rooms WHERE name = ?", (room[0],))
        if not c.fetchone():
            c.execute("INSERT INTO rooms (name, description, allowed_roles, created_by) VALUES (?, ?, ?, ?)", room)
    
    # Check and add approved column
    try:
        c.execute("SELECT approved FROM users LIMIT 1")
    except sqlite3.OperationalError:
        c.execute("ALTER TABLE users ADD COLUMN approved BOOLEAN DEFAULT FALSE")
        c.execute("UPDATE users SET approved = TRUE WHERE approved IS FALSE")
    
    # Check and add banned columns
    try:
        c.execute("SELECT banned, ban_reason, banned_at, banned_by FROM users LIMIT 1")
    except sqlite3.OperationalError:
        c.execute("ALTER TABLE users ADD COLUMN banned BOOLEAN DEFAULT FALSE")
        c.execute("ALTER TABLE users ADD COLUMN ban_reason TEXT")
        c.execute("ALTER TABLE users ADD COLUMN banned_at DATETIME")
        c.execute("ALTER TABLE users ADD COLUMN banned_by INTEGER")
    
    conn.commit()
    conn.close()

init_db()

# Decorators
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'username' not in session:
            return redirect(url_for('login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function

def role_required(roles):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'username' not in session:
                return redirect(url_for('login', next=request.url))
            if session.get('role') not in roles:
                return "Access denied", 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def approval_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login', next=request.url))
        
        conn = sqlite3.connect('chatdatabase.db')
        c = conn.cursor()
        c.execute("SELECT approved, banned FROM users WHERE id = ?", (session['user_id'],))
        user = c.fetchone()
        conn.close()
        
        if not user:
            session.clear()
            return redirect(url_for('login'))
        
        if not user[0]:
            return "Your account is pending admin approval. Please wait.", 403
        
        if user[1]:
            conn = sqlite3.connect('chatdatabase.db')
            c = conn.cursor()
            c.execute("SELECT ban_reason FROM users WHERE id = ?", (session['user_id'],))
            ban_reason = c.fetchone()[0] or "No reason provided"
            conn.close()
            session.clear()
            return f"Your account has been banned. Reason: {ban_reason}", 403
        
        return f(*args, **kwargs)
    return decorated_function

# Routes
@app.route('/')
def index():
    if 'username' in session:
        return redirect(url_for('chat'))
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        remember_me = 'remember_me' in request.form
        
        conn = sqlite3.connect('chatdatabase.db')
        c = conn.cursor()
        c.execute("SELECT id, username, role, approved, banned, unique_id FROM users WHERE username = ? AND password = ?", 
                 (username, password))
        user = c.fetchone()
        
        if user:
            if not user[3]:  # approved column
                conn.close()
                return render_template('login.html', error="Account pending admin approval. Please wait.")
            
            if user[4]:  # banned column
                c.execute("SELECT ban_reason FROM users WHERE id = ?", (user[0],))
                ban_details = c.fetchone()
                ban_reason = ban_details[0] if ban_details else "No reason provided"
                conn.close()
                return render_template('login.html', error=f"Account banned. Reason: {ban_reason}")
            
            session['username'] = user[1]
            session['role'] = user[2]
            session['user_id'] = user[0]
            session['unique_id'] = user[5]  # Store unique_id in session
            
            if remember_me:
                session.permanent = True
            
            c.execute("UPDATE users SET last_login = ?, is_online = TRUE WHERE id = ?", 
                     (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), user[0]))
            conn.commit()
            
            c.execute("SELECT * FROM user_settings WHERE user_id = ?", (user[0],))
            if not c.fetchone():
                c.execute("INSERT INTO user_settings (user_id) VALUES (?)", (user[0],))
                conn.commit()
            
            conn.close()
            
            next_page = request.args.get('next')
            return redirect(next_page) if next_page else redirect(url_for('chat'))
        
        conn.close()
        return render_template('login.html', error="Invalid credentials")
    
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        confirm_password = request.form['confirm_password']
        email = request.form.get('email', '')
        role = request.form['role']
        
        # Validation
        if password != confirm_password:
            return render_template('register.html', error="Passwords do not match")
        
        if len(username) < 3:
            return render_template('register.html', error="Username must be at least 3 characters")
        
        if len(password) < 6:
            return render_template('register.html', error="Password must be at least 6 characters")
        
        conn = sqlite3.connect('chatdatabase.db')
        c = conn.cursor()
        try:
            # Generate unique_id
            unique_id = generate_unique_id(c)
            
            # Insert new user with unique_id
            c.execute("INSERT INTO users (username, password, email, role, approved, unique_id) VALUES (?, ?, ?, ?, ?, ?)", 
                     (username, password, email, role, False, unique_id))
            conn.commit()
            
            # Create user settings
            user_id = c.lastrowid
            c.execute("INSERT INTO user_settings (user_id) VALUES (?)", (user_id,))
            conn.commit()
            
            conn.close()
            
            flash('Registration successful! Please wait for admin approval.')
            return redirect(url_for('login'))
        except sqlite3.IntegrityError:
            conn.close()
            return render_template('register.html', error="Username, email, or ID already exists")
    
    return render_template('register.html')

@app.route('/forgot_password', methods=['GET', 'POST'])
def forgot_password():
    if request.method == 'POST':
        unique_id = request.form['unique_id']
        conn = sqlite3.connect('chatdatabase.db')
        c = conn.cursor()
        c.execute("SELECT * FROM users WHERE unique_id = ?", (unique_id,))
        user = c.fetchone()
        
        if user:
            return render_template('forgot_password.html', 
                                 success=f"Valid ID. Proceed to reset your password using your ID: {unique_id}")
        
        conn.close()
        return render_template('forgot_password.html', error="Invalid ID")
    
    return render_template('forgot_password.html')

@app.route('/update_password', methods=['GET', 'POST'])
def update_password():
    if request.method == 'POST':
        if 'username' in session:
            # Logged-in user updating password
            username = session['username']
            new_password = request.form['new_password']
            confirm_password = request.form['confirm_password']
            
            if new_password != confirm_password:
                return render_template('update_password.html', error="Passwords do not match")
            
            conn = sqlite3.connect('chatdatabase.db')
            c = conn.cursor()
            c.execute("UPDATE users SET password = ? WHERE username = ?", 
                     (new_password, username))
            conn.commit()
            conn.close()
            return render_template('update_password.html', success="Password updated successfully")
        else:
            # Password reset via unique_id
            unique_id = request.form['unique_id']
            new_password = request.form['new_password']
            confirm_password = request.form['confirm_password']
            
            if new_password != confirm_password:
                return render_template('update_password.html', error="Passwords do not match")
            
            conn = sqlite3.connect('chatdatabase.db')
            c = conn.cursor()
            c.execute("SELECT * FROM users WHERE unique_id = ?", (unique_id,))
            user = c.fetchone()
            
            if user:
                c.execute("UPDATE users SET password = ? WHERE unique_id = ?", 
                         (new_password, unique_id))
                conn.commit()
                conn.close()
                return render_template('update_password.html', success="Password reset successfully. Please login.")
            
            conn.close()
            return render_template('update_password.html', error="Invalid ID")
    
    return render_template('update_password.html')

@app.route('/chat')
@login_required
@approval_required
def chat():
    conn = sqlite3.connect('chatdatabase.db')
    c = conn.cursor()
    
    # Get all rooms
    c.execute("SELECT name, description, allowed_roles FROM rooms WHERE is_active = TRUE")
    all_rooms = c.fetchall()
    
    # Filter rooms based on user role
    available_rooms = []
    for room in all_rooms:
        allowed_roles = json.loads(room[2])
        if session['role'] == 'admin' or session['role'] in allowed_roles:
            available_rooms.append({
                'name': room[0], 
                'description': room[1],
                'allowed_roles': allowed_roles
            })
    
    # Get user settings
    c.execute("SELECT theme, notifications, sound_effects, font_size, auto_login FROM user_settings WHERE user_id = ?", 
             (session['user_id'],))
    settings_row = c.fetchone()
    
    conn.close()
    
    settings = {}
    if settings_row:
        settings = {
            'theme': settings_row[0],
            'notifications': bool(settings_row[1]),
            'sound_effects': bool(settings_row[2]),
            'font_size': settings_row[3],
            'auto_login': bool(settings_row[4])
        }
    
    return render_template('chat.html', 
                         username=session['username'], 
                         role=session['role'],
                         rooms=available_rooms,
                         settings=settings)

@app.route('/get_online_users')
@login_required
@approval_required
def get_online_users():
    conn = sqlite3.connect('chatdatabase.db')
    c = conn.cursor()
    c.execute("SELECT username, role FROM users WHERE is_online = TRUE AND username != ?", (session['username'],))
    online_users = [{'username': row[0], 'role': row[1]} for row in c.fetchall()]
    conn.close()
    return jsonify(online_users)

@app.route('/send_message', methods=['POST'])
@login_required
@approval_required
def send_message():
    try:
        if 'room' not in request.form:
            print("Error: Missing 'room' field in request")
            return jsonify({'status': 'error', 'error': 'Room parameter is required'}), 400
        
        room = request.form['room']
        message_type = request.form.get('message_type', 'text')
        message = request.form.get('message', '').strip()
        reply_to = request.form.get('reply_to')
        
        print(f"Received message for room: {room}, type: {message_type}")
        print(f"Request form data: {dict(request.form)}")
        print(f"Request files: {request.files}")
        
        if message_type == 'text' and not message:
            print("Error: Text message is empty")
            return jsonify({'status': 'error', 'error': 'Text message cannot be empty'}), 400
        
        conn = sqlite3.connect('chatdatabase.db')
        c = conn.cursor()
        c.execute("SELECT allowed_roles FROM rooms WHERE name = ?", (room,))
        room_data = c.fetchone()
        
        if not room_data:
            conn.close()
            print("Room not found")
            return jsonify({'status': 'error', 'error': 'Room not found'}), 404
        
        allowed_roles = json.loads(room_data[0])
        if session['role'] != 'admin' and session['role'] not in allowed_roles:
            conn.close()
            print(f"Access denied: User role {session['role']} not allowed in room {room}")
            return jsonify({'status': 'error', 'error': 'Access denied to this room'}), 403
        
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        file_path = None
        
        if 'file' in request.files:
            file = request.files['file']
            print(f"File received: filename={file.filename}, content_type={file.content_type}")
            if file and file.filename and allowed_file(file.filename):
                if 'UPLOAD_FOLDER' not in app.config:
                    conn.close()
                    print("Error: UPLOAD_FOLDER not configured")
                    return jsonify({'status': 'error', 'error': 'Server configuration error: Upload folder not set'}), 500
                
                filename = secure_filename(file.filename)
                unique_filename = f"{session['user_id']}_{int(datetime.now().timestamp())}_{filename}"
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
                
                try:
                    os.makedirs(os.path.dirname(file_path), exist_ok=True)
                    file.save(file_path)
                    file_path = f"static/uploads/{unique_filename}"
                    print(f"File saved: {file_path}")
                except Exception as e:
                    conn.close()
                    print(f"Error saving file: {str(e)}")
                    return jsonify({'status': 'error', 'error': 'Failed to save file'}), 500
            else:
                conn.close()
                print(f"Error: Invalid file or extension")
                return jsonify({'status': 'error', 'error': f"Invalid file. Allowed extensions: {', '.join(ALLOWED_EXTENSIONS)}"}), 400
        
        if not message and not file_path and message_type != 'document':
            conn.close()
            print("Error: No message content or file provided")
            return jsonify({'status': 'error', 'error': 'Message or file required'}), 400
        
        reply_username = None
        reply_preview = None
        if reply_to:
            try:
                reply_to = int(reply_to)
                c.execute("""
                    SELECT username, message, message_type, file_path 
                    FROM messages 
                    WHERE id = ? AND room = ?
                """, (reply_to, room))
                reply_data = c.fetchone()
                if reply_data:
                    reply_username = reply_data[0]
                    reply_message = reply_data[1]
                    reply_message_type = reply_data[2]
                    reply_file_path = reply_data[3]
                    if reply_message_type in ['image', 'video', 'audio', 'document']:
                        reply_preview = f"[{reply_message_type.capitalize()} message]"
                    else:
                        reply_preview = reply_message[:50] + ('...' if len(reply_message) > 50 else '')
                else:
                    reply_to = None
            except (ValueError, TypeError):
                reply_to = None
        
        c.execute("""
            INSERT INTO messages (room, username, message, message_type, file_path, timestamp, reply_to) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (room, session['username'], message, message_type, file_path, timestamp, reply_to))
        
        message_id = c.lastrowid
        conn.commit()
        
        c.execute("""
            SELECT id, room, username, message, message_type, file_path, timestamp, is_edited, edited_at, reply_to
            FROM messages 
            WHERE id = ?
        """, (message_id,))
        
        message_row = c.fetchone()
        conn.close()
        
        if not message_row:
            print("Error: Failed to retrieve inserted message")
            return jsonify({'status': 'error', 'error': 'Failed to send message'}), 500
        
        message_data = {
            'status': 'success',
            'id': message_row[0],
            'room': message_row[1],
            'username': message_row[2],
            'message': message_row[3],
            'message_type': message_row[4],
            'file_path': message_row[5],
            'timestamp': message_row[6],
            'is_edited': bool(message_row[7]),
            'edited_at': message_row[8],
            'reply_to': message_row[9],
            'reply_username': reply_username,
            'reply_preview': reply_preview
        }
        
        print("Message inserted successfully")
        return jsonify(message_data)
        
    except sqlite3.Error as e:
        print(f"Database error in send_message: {str(e)}")
        if 'conn' in locals():
            conn.close()
        return jsonify({'status': 'error', 'error': 'Database error occurred'}), 500
    except Exception as e:
        print(f"Error in send_message: {str(e)}")
        if 'conn' in locals():
            conn.close()
        return jsonify({'status': 'error', 'error': f'Server error: {str(e)}'}), 500

@app.route('/get_messages/<room>')
@login_required
@approval_required
def get_messages(room):
    conn = sqlite3.connect('chatdatabase.db')
    c = conn.cursor()
    
    c.execute("SELECT allowed_roles FROM rooms WHERE name = ?", (room,))
    room_data = c.fetchone()
    
    if not room_data:
        conn.close()
        return jsonify({'error': 'Room not found'}), 404
    
    allowed_roles = json.loads(room_data[0])
    if session['role'] != 'admin' and session['role'] not in allowed_roles:
        conn.close()
        return jsonify({'error': 'Access denied to this room'}), 403
    
    limit = request.args.get('limit', 850)
    offset = request.args.get('offset', 0)
    
    c.execute("""
        SELECT id, username, message, message_type, file_path, timestamp, is_edited, edited_at, reply_to
        FROM messages 
        WHERE room = ? 
        ORDER BY timestamp DESC 
        LIMIT ? OFFSET ?
    """, (room, limit, offset))
    
    messages = []
    for row in c.fetchall():
        message = {
            'id': row[0],
            'username': row[1],
            'message': row[2],
            'message_type': row[3],
            'file_path': row[4],
            'timestamp': row[5],
            'is_edited': bool(row[6]),
            'edited_at': row[7],
            'reply_to': row[8]
        }
        if message['reply_to']:
            c.execute("""
                SELECT username, message, message_type, file_path 
                FROM messages 
                WHERE id = ?
            """, (message['reply_to'],))
            reply_data = c.fetchone()
            if reply_data:
                message['reply_username'] = reply_data[0]
                reply_message = reply_data[1]
                reply_message_type = reply_data[2]
                if reply_message_type in ['image', 'video', 'audio', 'document']:
                    message['reply_preview'] = f"[{reply_message_type.capitalize()} message]"
                else:
                    message['reply_preview'] = reply_message[:50] + ('...' if len(reply_message) > 50 else '')
        messages.append(message)
    
    conn.close()
    return jsonify(messages[::-1])

@app.route('/search_messages')
@login_required
@approval_required
def search_messages():
    query = request.args.get('q')
    room = request.args.get('room')
    
    if not query:
        return jsonify({'error': 'Query parameter required'}), 400
    
    conn = sqlite3.connect('chatdatabase.db')
    c = conn.cursor()
    c.execute("""
        SELECT id, username, message, message_type, timestamp, reply_to
        FROM messages 
        WHERE room = ? AND message LIKE ? 
        ORDER BY timestamp DESC
    """, (room, f'%{query}%'))
    
    results = []
    for row in c.fetchall():
        message = {
            'id': row[0],
            'username': row[1],
            'message': row[2],
            'message_type': row[3],
            'timestamp': row[4],
            'reply_to': row[5]
        }
        if message['reply_to']:
            c.execute("""
                SELECT username, message, message_type 
                FROM messages 
                WHERE id = ?
            """, (message['reply_to'],))
            reply_data = c.fetchone()
            if reply_data:
                message['reply_username'] = reply_data[0]
                reply_message = reply_data[1]
                reply_message_type = reply_data[2]
                if reply_message_type in ['image', 'video', 'audio', 'document']:
                    message['reply_preview'] = f"[{reply_message_type.capitalize()} message]"
                else:
                    message['reply_preview'] = reply_message[:50] + ('...' if len(reply_message) > 50 else '')
        results.append(message)
    
    conn.close()
    return jsonify(results)

@app.route('/user_settings', methods=['GET', 'POST'])
@login_required
@approval_required
def user_settings():
    if request.method == 'POST':
        theme = request.form.get('theme')
        notifications = 'notifications' in request.form
        sound_effects = 'sound_effects' in request.form
        font_size = request.form.get('font_size')
        auto_login = 'auto_login' in request.form
        
        conn = sqlite3.connect('chatdatabase.db')
        c = conn.cursor()
        c.execute("""
            UPDATE user_settings 
            SET theme = ?, notifications = ?, sound_effects = ?, font_size = ?, auto_login = ?
            WHERE user_id = ?
        """, (theme, notifications, sound_effects, font_size, auto_login, session['user_id']))
        conn.commit()
        conn.close()
        
        flash('Settings saved successfully!')
        return redirect(url_for('user_settings'))
    
    conn = sqlite3.connect('chatdatabase.db')
    c = conn.cursor()
    c.execute("SELECT theme, notifications, sound_effects, font_size, auto_login FROM user_settings WHERE user_id = ?", 
             (session['user_id'],))
    settings_row = c.fetchone()
    conn.close()
    
    settings = {}
    if settings_row:
        settings = {
            'theme': settings_row[0],
            'notifications': bool(settings_row[1]),
            'sound_effects': bool(settings_row[2]),
            'font_size': settings_row[3],
            'auto_login': bool(settings_row[4])
        }
    
    return render_template('user_settings.html', settings=settings)

@app.route('/edit_message', methods=['POST'])
@login_required
@approval_required
def edit_message():
    try:
        data = request.get_json()
        message_id = data.get('message_id')
        new_message = data.get('new_message')
        
        if not message_id or not new_message:
            return jsonify({'error': 'Message ID and new message content are required'}), 400
        
        conn = sqlite3.connect('chatdatabase.db')
        c = conn.cursor()
        
        c.execute("SELECT room, message_type FROM messages WHERE id = ? AND username = ?", 
                 (message_id, session['username']))
        message = c.fetchone()
        
        if not message:
            conn.close()
            return jsonify({'error': 'Message not found or you do not have permission to edit it'}), 403
        
        if message[1] != 'text':
            conn.close()
            return jsonify({'error': 'Only text messages can be edited'}), 400
        
        c.execute("SELECT allowed_roles FROM rooms WHERE name = ?", (message[0],))
        room_data = c.fetchone()
        
        if not room_data:
            conn.close()
            return jsonify({'error': 'Room not found'}), 404
        
        allowed_roles = json.loads(room_data[0])
        if session['role'] != 'admin' and session['role'] not in allowed_roles:
            conn.close()
            return jsonify({'error': 'Access denied to this room'}), 403
        
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        c.execute("""
            UPDATE messages 
            SET message = ?, is_edited = TRUE, edited_at = ?
            WHERE id = ? AND username = ?
        """, (new_message, timestamp, message_id, session['username']))
        
        if c.rowcount == 0:
            conn.close()
            return jsonify({'error': 'Failed to edit message'}), 500
        
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'success'})
    except Exception as e:
        if 'conn' in locals():
            conn.close()
        return jsonify({'error': str(e)}), 500

@app.route('/delete_message', methods=['POST'])
@login_required
@approval_required
def delete_message():
    try:
        data = request.get_json()
        message_id = data.get('message_id')
        
        if not message_id:
            return jsonify({'error': 'Message ID is required'}), 400
        
        conn = sqlite3.connect('chatdatabase.db')
        c = conn.cursor()
        
        c.execute("SELECT room, username, message_type, file_path FROM messages WHERE id = ?", (message_id,))
        message = c.fetchone()
        
        if not message:
            conn.close()
            return jsonify({'error': 'Message not found'}), 404
        
        if message[1] != session['username'] and session['role'] != 'admin':
            conn.close()
            return jsonify({'error': 'You do not have permission to delete this message'}), 403
        
        c.execute("SELECT allowed_roles FROM rooms WHERE name = ?", (message[0],))
        room_data = c.fetchone()
        
        if not room_data:
            conn.close()
            return jsonify({'error': 'Room not found'}), 404
        
        allowed_roles = json.loads(room_data[0])
        if session['role'] != 'admin' and session['role'] not in allowed_roles:
            conn.close()
            return jsonify({'error': 'Access denied to this room'}), 403
        
        # Delete associated media file if it exists
        if message[2] in ['image', 'video', 'audio', 'document'] and message[3]:
            try:
                file_path = os.path.join('static/uploads', message[3].split('/')[-1])
                if os.path.exists(file_path):
                    os.remove(file_path)
            except Exception as e:
                print(f"Error deleting file: {str(e)}")
                # Continue with message deletion even if file deletion fails
        
        c.execute("DELETE FROM messages WHERE id = ?", (message_id,))
        
        if c.rowcount == 0:
            conn.close()
            return jsonify({'error': 'Failed to delete message'}), 500
        
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'success'})
    except Exception as e:
        if 'conn' in locals():
            conn.close()
        return jsonify({'error': str(e)}), 500

@app.route('/logout')
def logout():
    if 'username' in session:
        conn = sqlite3.connect('chatdatabase.db')
        c = conn.cursor()
        c.execute("UPDATE users SET is_online = FALSE WHERE username = ?", (session['username'],))
        conn.commit()
        conn.close()
    
    session.clear()
    flash('You have been logged out successfully.')
    return redirect(url_for('login'))

# Admin routes
ADMIN_CREDENTIALS = {
    'admin': {
        'password': 'admin123',  # Change this in production!
        'role': 'admin',
        'email': 'admin@kgoloko.com'
    },
    'superadmin': {
        'password': 'superadmin456',  # Change this in production!
        'role': 'admin',
        'email': 'superadmin@kgoloko.com'
    }
}

@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        remember_me = 'remember_me' in request.form
        
        if username in ADMIN_CREDENTIALS and ADMIN_CREDENTIALS[username]['password'] == password:
            conn = sqlite3.connect('chatdatabase.db')
            c = conn.cursor()
            
            c.execute("SELECT id, approved, banned, unique_id FROM users WHERE username = ? AND role = 'admin'", (username,))
            existing_admin = c.fetchone()
            
            if existing_admin:
                user_id = existing_admin[0]
                if not existing_admin[1] or existing_admin[2]:
                    conn.close()
                    return render_template('admin_login.html', error="Admin account is disabled. Please contact system administrator.")
                unique_id = existing_admin[3]
            else:
                unique_id = generate_unique_id(c)
                try:
                    c.execute("INSERT INTO users (username, password, email, role, approved, unique_id) VALUES (?, ?, ?, ?, ?, ?)", 
                             (username, password, ADMIN_CREDENTIALS[username]['email'], 'admin', True, unique_id))
                    conn.commit()
                    user_id = c.lastrowid
                    
                    c.execute("INSERT INTO user_settings (user_id) VALUES (?)", (user_id,))
                    conn.commit()
                except sqlite3.IntegrityError:
                    conn.close()
                    return render_template('admin_login.html', error="Admin account creation failed.")
            
            session['username'] = username
            session['role'] = 'admin'
            session['user_id'] = user_id
            session['unique_id'] = unique_id
            session['is_admin'] = True
            session['is_simulated_admin'] = True
            
            if remember_me:
                session.permanent = True
            
            c.execute("UPDATE users SET last_login = ?, is_online = TRUE WHERE id = ?", 
                     (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), user_id))
            conn.commit()
            conn.close()
            
            flash('Admin login successful!')
            return redirect(url_for('admin_users'))
        
        return render_template('admin_login.html', error="Invalid admin credentials")
    
    return render_template('admin_login.html')

@app.route('/admin/users')
@login_required
@role_required(['admin'])
def admin_users():
    conn = sqlite3.connect('chatdatabase.db')
    c = conn.cursor()
    
    c.execute("""
        SELECT id, username, email, role, approved, banned, ban_reason, created_at, unique_id 
        FROM users 
        ORDER BY created_at DESC
    """)
    users = c.fetchall()
    
    conn.close()
    
    user_list = [
        {
            'id': user[0],
            'username': user[1],
            'email': user[2],
            'role': user[3],
            'approved': user[4],
            'banned': user[5],
            'ban_reason': user[6],
            'created_at': user[7],
            'unique_id': user[8]  # Include unique_id
        } for user in users
    ]
    
    return render_template('admin_users.html', users=user_list)

@app.route('/admin/approve_user/<int:user_id>')
@login_required
@role_required(['admin'])
def approve_user(user_id):
    conn = sqlite3.connect('chatdatabase.db')
    c = conn.cursor()
    
    c.execute("UPDATE users SET approved = TRUE WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    
    flash('User approved successfully!')
    return redirect(url_for('admin_users'))

@app.route('/admin/reject_user/<int:user_id>')
@login_required
@role_required(['admin'])
def reject_user(user_id):
    conn = sqlite3.connect('chatdatabase.db')
    c = conn.cursor()
    
    c.execute("DELETE FROM users WHERE id = ?", (user_id,))
    c.execute("DELETE FROM user_settings WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()
    
    flash('User rejected and removed from system!')
    return redirect(url_for('admin_users'))

@app.route('/admin/ban_user/<int:user_id>', methods=['GET', 'POST'])
@login_required
@role_required(['admin'])
def ban_user(user_id):
    if request.method == 'POST':
        ban_reason = request.form.get('ban_reason', 'No reason provided')
        
        conn = sqlite3.connect('chatdatabase.db')
        c = conn.cursor()
        
        c.execute("UPDATE users SET banned = TRUE, ban_reason = ?, banned_at = ?, banned_by = ? WHERE id = ?", 
                 (ban_reason, datetime.now().strftime('%Y-%m-%d %H:%M:%S'), session['user_id'], user_id))
        
        c.execute("UPDATE users SET is_online = FALSE WHERE id = ?", (user_id,))
        
        conn.commit()
        
        c.execute("SELECT username FROM users WHERE id = ?", (user_id,))
        username = c.fetchone()[0]
        
        conn.close()
        
        flash(f'User {username} has been banned successfully!')
        return redirect(url_for('admin_users'))
    
    conn = sqlite3.connect('chatdatabase.db')
    c = conn.cursor()
    c.execute("SELECT username FROM users WHERE id = ?", (user_id,))
    user = c.fetchone()
    conn.close()
    
    if not user:
        flash('User not found!')
        return redirect(url_for('admin_users'))
    
    return render_template('ban_user.html', user={'id': user_id, 'username': user[0]})

@app.route('/static/uploads/<path:filename>')
def serve_uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/admin/unban_user/<int:user_id>')
@login_required
@role_required(['admin'])
def unban_user(user_id):
    conn = sqlite3.connect('chatdatabase.db')
    c = conn.cursor()
    
    c.execute("UPDATE users SET banned = FALSE, ban_reason = NULL, banned_at = NULL, banned_by = NULL WHERE id = ?", 
             (user_id,))
    
    conn.commit()
    
    c.execute("SELECT username FROM users WHERE id = ?", (user_id,))
    username = c.fetchone()[0]
    
    conn.close()
    
    flash(f'User {username} has been unbanned successfully!')
    return redirect(url_for('admin_users'))

# Error handlers
@app.errorhandler(404)
def page_not_found(e):
    return render_template('404.html'), 404

@app.errorhandler(500)
def internal_server_error(e):
    return render_template('500.html'), 500

@app.errorhandler(403)
def forbidden(e):
    return render_template('403.html'), 403

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)