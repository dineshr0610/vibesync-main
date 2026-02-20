document.addEventListener('DOMContentLoaded', () => {
    // Check if user is logged in
    const userId = localStorage.getItem('vibesync_user_id');
    const userIdentifier = localStorage.getItem('vibesync_user_identifier'); // Phone or Email

    const userDisplay = document.getElementById('user-phone-display');
    const adminLink = document.getElementById('admin-link-container');

    // ADMIN EMAIL CONFIGURATION
    const ADMIN_EMAILS = ['dinesh2370049@ssn.edu.in', 'bobby06102005@gmail.com'];

    // --- HOME PAGE LOGIC (If on home.html) ---
    if (window.location.pathname.includes('home.html') || document.title.includes('Player')) {
        if (userId) {
            // Display User Info
            if (userId === 'guest') {
                if (userDisplay) userDisplay.textContent = "Guest";
            } else if (userIdentifier) {
                if (userDisplay) userDisplay.textContent = userIdentifier;

                // Show Admin Link
                if (ADMIN_EMAILS.includes(userIdentifier) && adminLink) {
                    adminLink.style.display = 'inline';
                }
            }
        } else {
            // Not logged in -> Redirect
            window.location.href = 'index.html';
        }
    }

    // Handle Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('vibesync_user_id');
            localStorage.removeItem('vibesync_user_identifier');
            window.location.href = 'index.html';
        });
    }

    // Guest Login
    const guestBtn = document.getElementById('guest-btn');
    if (guestBtn) {
        guestBtn.addEventListener('click', () => {
            localStorage.setItem('vibesync_user_id', 'guest');
            localStorage.setItem('vibesync_user_identifier', 'Guest');
            window.location.href = 'home.html';
        });
    }

    // Send OTP
    const sendOtpBtn = document.getElementById('send-otp-btn');
    if (sendOtpBtn) {
        sendOtpBtn.addEventListener('click', async () => {
            const inputVal = document.getElementById('auth-input').value;
            const btn = sendOtpBtn;

            if (!inputVal) {
                alert("Please enter a phone number or email.");
                return;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(inputVal)) {
                alert("Please enter a valid email address.");
                return;
            }

            // 1. Disable button and show loading
            btn.disabled = true;
            const originalText = btn.innerText;
            btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Sending...`;

            const payload = { email: inputVal };

            try {
                const response = await fetch(`${API_URL}/auth/send-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (response.ok) {
                    // Success logic
                    alert("OTP sent! Please check your email inbox.");
                    document.getElementById('login-form-initial').style.display = 'none';
                    document.getElementById('otp-group').style.display = 'block';

                    // 2. Cooldown Timer (30s)
                    let cooldown = 30;
                    const timer = setInterval(() => {
                        btn.innerText = `Resend in ${cooldown}s`;
                        cooldown--;
                        if (cooldown < 0) {
                            clearInterval(timer);
                            btn.disabled = false;
                            btn.innerText = originalText;
                        }
                    }, 1000);

                } else {
                    // Fail logic
                    alert(data.error || "Failed to send OTP");
                    btn.disabled = false;
                    btn.innerText = originalText;
                }
            } catch (error) {
                console.error("Error sending OTP:", error);
                alert("Error connecting to auth server.");
                btn.disabled = false;
                btn.innerText = originalText;
            }
        });
    }

    // Verify OTP
    const verifyOtpBtn = document.getElementById('verify-otp-btn');
    if (verifyOtpBtn) {
        verifyOtpBtn.addEventListener('click', async () => {
            const inputVal = document.getElementById('auth-input').value;
            const otp = document.getElementById('otp-input').value;

            const payload = { email: inputVal, otp };

            try {
                const response = await fetch(`${API_URL}/auth/verify-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();

                if (response.ok) {
                    localStorage.setItem('vibesync_user_id', data.userId);
                    localStorage.setItem('vibesync_user_identifier', inputVal);
                    // alert("Login Successful! Welcome."); 
                    window.location.href = 'home.html';
                } else {
                    alert(data.error || "Invalid OTP");
                }
            } catch (error) {
                console.error("Error verifying OTP:", error);
                alert("Verification failed.");
            }
        });
    }

    // Back to Email
    const backBtn = document.getElementById('back-to-email-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            document.getElementById('otp-group').style.display = 'none';
            document.getElementById('login-form-initial').style.display = 'block';
        });
    }
});
