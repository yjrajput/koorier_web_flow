        console.log('onboarding.js loaded');
        alert('JS loaded');

        // ==================== API CONFIGURATION ====================
        const API_BASE_URL = 'https://integapi.koorierinc.net/qa/api';
        const PUBLIC_API_BASE_URL = 'https://integapi.koorierinc.net/qa/public/api';

        // ==================== VALIDATION STATE ====================
        let validationState = {
            firstNameValid: false,
            lastNameValid: false,
            usernameFormatValid: false,
            emailFormatValid: false,
            passwordValid: false,
            confirmPasswordValid: false
        };

        // ==================== ERROR MAPPING ====================
        // Maps API error details/titles to specific form fields
        const errorFieldMapping = {
            // Business email errors
            'BUSINESS_EMAIL_ALREADY_EXISTS': { field: 'businessEmail', message: 'This business email is already registered' },
            'Business email already exists': { field: 'businessEmail', message: 'This business email is already registered' },

            // Personal email errors
            'EMAIL_ALREADY_EXISTS': { field: 'email', message: 'This email is already registered', step: 1 },
            'Email already exists': { field: 'email', message: 'This email is already registered', step: 1 },

            // Username/Login errors
            'LOGIN_ALREADY_EXISTS': { field: 'userName', message: 'This username is already taken', step: 1 },
            'USERNAME_ALREADY_EXISTS': { field: 'userName', message: 'This username is already taken', step: 1 },
            'Login already exists': { field: 'userName', message: 'This username is already taken', step: 1 },
            'Username already exists': { field: 'userName', message: 'This username is already taken', step: 1 },

            // Business name errors
            'BUSINESS_NAME_ALREADY_EXISTS': { field: 'businessName', message: 'This business name is already registered' },
            'Business name already exists': { field: 'businessName', message: 'This business name is already registered' },

            // Client code errors
            'CLIENT_CODE_ALREADY_EXISTS': { field: 'businessName', message: 'A business with similar name already exists. Please use a different name' },
            'Client code already exists': { field: 'businessName', message: 'A business with similar name already exists. Please use a different name' },

            // Postal code errors
            'INVALID_POSTAL_CODE': { field: 'postalCode', message: 'Please enter a valid postal code' },
            'Invalid postal code': { field: 'postalCode', message: 'Please enter a valid postal code' }
        };

        // ==================== FSA ZONES DATA ====================
        const fsaZonesByDC = {
            Mississauga: [
                'Hamilton', 'Burl/Milton/Oakville', 'GTA - Brampton', 'GTA - Mississauga South',
                'GTA - Mississauga North', 'GTA - Etobicoke', 'GTA - Vaughan', 'Richmond Hill',
                'GTA - North York', 'York/HighP/Dover/TrinityB', 'Midtown/YorkM/DonM', 'Toronto South',
                'GTA - Scarborough South', 'GTA - Scarborough North', 'GTA - Markham',
                'Pickering/Ajax', 'Oshawa/Whitby'
            ],
            Vancouver: [
                'Burnaby/Coquitlam', 'Richmond/Delta', 'Surrey', 'Center Vancouver',
                'Downtown Vancouver', 'North West Vancouver'
            ]
        };

        // ==================== FORM DATA STORAGE ====================
        let formData = { personal: {}, business: {}, response: null };
        let currentStep = 1;
        let selectedFsaZones = [];
        let agreementAccepted = false;

        // ==================== NAVIGATION ====================
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                const href = this.getAttribute('href');
                if (href !== '#' && document.querySelector(href)) {
                    e.preventDefault();
                    document.querySelector(href).scrollIntoView({ behavior: 'smooth' });
                }
            });
        });

        // ==================== CONTINUE BUTTON STATE ====================
        function updateContinueButtonState() {
            const btn = document.getElementById('step1ContinueBtn');
            if (!btn) return;

            const allLocalFieldsValid =
                validationState.firstNameValid &&
                validationState.lastNameValid &&
                validationState.usernameFormatValid &&
                validationState.emailFormatValid &&
                validationState.passwordValid &&
                validationState.confirmPasswordValid;

            btn.disabled = !allLocalFieldsValid;
        }

        // ==================== USERNAME FORMAT VALIDATION ====================
        function validateUsernameFormat(username) {
            const errors = [];

            if (!username || username.trim() === '') {
                return { valid: false, errors: ['Username is required'] };
            }

            username = username.trim();

            if (username.length < 3) errors.push('Username must be at least 3 characters');
            if (username.length > 50) errors.push('Username cannot exceed 50 characters');
            if (/\s/.test(username)) errors.push('Username cannot contain spaces');
            if (!/^[a-zA-Z0-9._-]+$/.test(username)) errors.push('Only letters, numbers, dot (.), underscore (_), and hyphen (-) allowed');
            if (!/^[a-zA-Z0-9]/.test(username)) errors.push('Username must start with a letter or number');
            if (!/[a-zA-Z0-9]$/.test(username)) errors.push('Username must end with a letter or number');
            if (/\.{2,}|_{2,}|-{2,}/.test(username)) errors.push('No consecutive special characters allowed');

            return { valid: errors.length === 0, errors };
        }

        // ==================== EMAIL FORMAT VALIDATION ====================
        function validateEmailFormat(email) {
            const errors = [];

            if (!email || email.trim() === '') {
                return { valid: false, errors: ['Email is required'] };
            }

            email = email.trim().toLowerCase();

            if (email.length > 254) errors.push('Email cannot exceed 254 characters');
            if (/\s/.test(email)) errors.push('Email cannot contain spaces');

            const atCount = (email.match(/@/g) || []).length;
            if (atCount === 0) errors.push('Email must contain @ symbol');
            else if (atCount > 1) errors.push('Email can only contain one @ symbol');

            if (/\.{2,}/.test(email)) errors.push('Email cannot have consecutive dots');
            if (email.startsWith('.')) errors.push('Email cannot start with a dot');
            if (email.endsWith('.')) errors.push('Email cannot end with a dot');

            const emailRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/;
            if (atCount === 1 && !emailRegex.test(email) && errors.length === 0) {
                errors.push('Please enter a valid email format');
            }

            return { valid: errors.length === 0, errors };
        }

        // ==================== API VALIDATION (Called on Continue Click) ====================
        async function validateUsernameAndEmailAvailability(username, email) {
            const results = {
                usernameAvailable: null,
                emailAvailable: null,
                usernameError: null,
                emailError: null,
                success: false
            };

            try {
                const response = await fetch(
                    `${PUBLIC_API_BASE_URL}/user/validate?login=${encodeURIComponent(username)}&email=${encodeURIComponent(email.toLowerCase())}`,
                    {
                        method: 'GET',
                        headers: { 'Accept': 'application/json' }
                    }
                );

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();

                const usernameExists = data.loginExists ?? data.usernameExists ?? data.login?.exists ?? !data.usernameAvailable ?? !data.loginAvailable ?? false;
                const emailExists = data.emailExists ?? data.email?.exists ?? !data.emailAvailable ?? false;

                results.usernameAvailable = !usernameExists;
                results.emailAvailable = !emailExists;

                if (usernameExists) {
                    results.usernameError = 'Username is already taken. Please choose another.';
                }
                if (emailExists) {
                    results.emailError = 'Email is already registered. Please use another email or login.';
                }

                results.success = !usernameExists && !emailExists;

            } catch (error) {
                console.error('Validation API error:', error);
                results.usernameError = 'Unable to verify credentials. Please try again.';
                results.emailError = 'Unable to verify credentials. Please try again.';
                results.success = false;
            }

            return results;
        }

        // ==================== PARSE API ERROR RESPONSE ====================
        function parseApiError(data) {
            const result = {
                fieldErrors: [],
                generalMessage: 'Registration failed. Please try again.'
            };

            // Check for detail field (most specific)
            if (data.detail) {
                const mapping = errorFieldMapping[data.detail];
                if (mapping) {
                    result.fieldErrors.push(mapping);
                    result.generalMessage = null; // No need for general message if we have field error
                } else {
                    result.generalMessage = data.detail.replace(/_/g, ' ').toLowerCase();
                    result.generalMessage = result.generalMessage.charAt(0).toUpperCase() + result.generalMessage.slice(1);
                }
            }

            // Check for title field
            if (data.title && result.fieldErrors.length === 0) {
                const mapping = errorFieldMapping[data.title];
                if (mapping) {
                    result.fieldErrors.push(mapping);
                    result.generalMessage = null;
                } else if (!data.detail) {
                    result.generalMessage = data.title;
                }
            }

            // Check for message field
            if (data.message && result.fieldErrors.length === 0) {
                const mapping = errorFieldMapping[data.message];
                if (mapping) {
                    result.fieldErrors.push(mapping);
                    result.generalMessage = null;
                } else if (!data.detail && !data.title) {
                    result.generalMessage = data.message;
                }
            }

            // Check for error field
            if (data.error && result.fieldErrors.length === 0 && !data.detail && !data.title && !data.message) {
                result.generalMessage = data.error;
            }

            // Check for errors object (field validation errors from Spring)
            if (data.errors && typeof data.errors === 'object') {
                Object.entries(data.errors).forEach(([field, messages]) => {
                    const messageArray = Array.isArray(messages) ? messages : [messages];
                    messageArray.forEach(msg => {
                        result.fieldErrors.push({
                            field: field,
                            message: msg
                        });
                    });
                });
                if (result.fieldErrors.length > 0) {
                    result.generalMessage = null;
                }
            }

            // Check for fieldErrors array (another common Spring format)
            if (data.fieldErrors && Array.isArray(data.fieldErrors)) {
                data.fieldErrors.forEach(fe => {
                    result.fieldErrors.push({
                        field: fe.field || fe.objectName,
                        message: fe.message || fe.defaultMessage
                    });
                });
                if (result.fieldErrors.length > 0) {
                    result.generalMessage = null;
                }
            }

            return result;
        }

        // ==================== FIELD STATUS UI ====================
        function updateFieldStatus(fieldId, status) {
            const field = document.getElementById(fieldId);
            if (!field) return;

            const wrapper = field.closest('.input-wrapper');
            if (!wrapper) return;

            const existingIndicator = wrapper.querySelector('.field-status');
            if (existingIndicator) existingIndicator.remove();

            if (!status) return;

            const indicator = document.createElement('span');
            indicator.className = 'field-status';
            indicator.style.cssText = `
            position: absolute;
            right: 1rem;
            top: 50%;
            transform: translateY(-50%);
            font-size: 0.9rem;
            z-index: 10;
        `;

            switch (status) {
                case 'checking':
                    indicator.innerHTML = '<i class="fas fa-spinner fa-spin" style="color: #5d48ff;"></i>';
                    break;
                case 'available':
                    indicator.innerHTML = '<i class="fas fa-check-circle" style="color: #d0fd5b;"></i>';
                    break;
                case 'taken':
                    indicator.innerHTML = '<i class="fas fa-times-circle" style="color: #ff4d4d;"></i>';
                    break;
                case 'error':
                    indicator.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: #fbbf24;"></i>';
                    break;
                case 'valid':
                    indicator.innerHTML = '<i class="fas fa-check" style="color: #d0fd5b;"></i>';
                    break;
                default:
                    return;
            }

            wrapper.style.position = 'relative';
            wrapper.appendChild(indicator);
        }

        function clearFieldStatus(fieldId) {
            const field = document.getElementById(fieldId);
            if (!field) return;

            const wrapper = field.closest('.input-wrapper');
            if (!wrapper) return;

            const existingIndicator = wrapper.querySelector('.field-status');
            if (existingIndicator) existingIndicator.remove();
        }

        // ==================== LOCAL VALIDATION HANDLERS ====================
        function handleFirstNameInput(event) {
            const value = event.target.value.trim();
            clearError('firstName');

            if (!value) {
                validationState.firstNameValid = false;
                showError('firstName', 'First name is required');
            } else {
                validationState.firstNameValid = true;
                clearError('firstName');
            }

            updateContinueButtonState();
        }

        function handleLastNameInput(event) {
            const value = event.target.value.trim();
            clearError('lastName');

            if (!value) {
                validationState.lastNameValid = false;
                showError('lastName', 'Last name is required');
            } else {
                validationState.lastNameValid = true;
                clearError('lastName');
            }

            updateContinueButtonState();
        }

        function handleUsernameInput(event) {
            const username = event.target.value.trim();
            clearError('userName');
            clearFieldStatus('userName');

            if (!username) {
                validationState.usernameFormatValid = false;
                updateContinueButtonState();
                return;
            }

            const formatValidation = validateUsernameFormat(username);
            if (!formatValidation.valid) {
                validationState.usernameFormatValid = false;
                showError('userName', formatValidation.errors[0]);
            } else {
                validationState.usernameFormatValid = true;
                clearError('userName');
            }

            updateContinueButtonState();
        }

        function handleEmailInput(event) {
            const email = event.target.value.trim();
            clearError('email');
            clearFieldStatus('email');

            if (!email) {
                validationState.emailFormatValid = false;
                updateContinueButtonState();
                return;
            }

            const formatValidation = validateEmailFormat(email);
            if (!formatValidation.valid) {
                validationState.emailFormatValid = false;
                showError('email', formatValidation.errors[0]);
            } else {
                validationState.emailFormatValid = true;
                clearError('email');
            }

            updateContinueButtonState();
        }

        function handlePasswordInput(event) {
            const password = event.target.value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            clearError('password');
            checkPasswordStrength();

            if (!password) {
                validationState.passwordValid = false;
                showError('password', 'Password is required');
            } else if (password.length < 8) {
                validationState.passwordValid = false;
                showError('password', 'Password must be at least 8 characters');
            } else {
                validationState.passwordValid = true;
                clearError('password');
            }

            if (confirmPassword) {
                handleConfirmPasswordInput({ target: document.getElementById('confirmPassword') });
            }

            updateContinueButtonState();
        }

        function handleConfirmPasswordInput(event) {
            const confirmPassword = event.target.value;
            const password = document.getElementById('password').value;

            clearError('confirmPassword');

            if (!confirmPassword) {
                validationState.confirmPasswordValid = false;
                showError('confirmPassword', 'Please confirm your password');
            } else if (confirmPassword !== password) {
                validationState.confirmPasswordValid = false;
                showError('confirmPassword', 'Passwords do not match');
            } else {
                validationState.confirmPasswordValid = true;
                clearError('confirmPassword');
            }

            updateContinueButtonState();
        }

        // ==================== INITIALIZE EVENT LISTENERS ====================
        document.addEventListener('DOMContentLoaded', function () {
            const firstNameField = document.getElementById('firstName');
            if (firstNameField) {
                firstNameField.addEventListener('input', handleFirstNameInput);
                firstNameField.addEventListener('blur', handleFirstNameInput);
            }

            const lastNameField = document.getElementById('lastName');
            if (lastNameField) {
                lastNameField.addEventListener('input', handleLastNameInput);
                lastNameField.addEventListener('blur', handleLastNameInput);
            }

            const usernameField = document.getElementById('userName');
            if (usernameField) {
                usernameField.addEventListener('input', handleUsernameInput);
                usernameField.addEventListener('blur', handleUsernameInput);
            }

            const emailField = document.getElementById('email');
            if (emailField) {
                emailField.addEventListener('input', handleEmailInput);
                emailField.addEventListener('blur', handleEmailInput);
            }

            const passwordField = document.getElementById('password');
            if (passwordField) {
                passwordField.addEventListener('input', handlePasswordInput);
                passwordField.addEventListener('blur', handlePasswordInput);
            }

            const confirmPasswordField = document.getElementById('confirmPassword');
            if (confirmPasswordField) {
                confirmPasswordField.addEventListener('input', handleConfirmPasswordInput);
                confirmPasswordField.addEventListener('blur', handleConfirmPasswordInput);
            }

            updateContinueButtonState();
        });

        // ==================== ONBOARDING FLOW ====================
        function startOnboarding() {
            document.getElementById('main-content').style.display = 'none';
            document.querySelector('.seller-onbording-footer-section').style.display = 'none';
            document.querySelector('.seller-nav-section').style.display = 'none';
            document.getElementById('onboarding-page').classList.add('active');
            window.scrollTo(0, 0);

            setTimeout(() => {
                updateContinueButtonState();
            }, 100);
            
        }

        function cancelOnboarding() {
            document.getElementById('main-content').style.display = 'block';
            document.querySelector('.seller-onbording-footer-section').style.display = 'block';
            document.querySelector('.seller-nav-section').style.display = 'flex';
            document.getElementById('onboarding-page').classList.remove('active');
            resetOnboarding();
            window.scrollTo(0, 0);
        }

        function resetOnboarding() {
            currentStep = 1;
            selectedFsaZones = [];
            agreementAccepted = false;
            formData = { personal: {}, business: {}, response: null };

            validationState = {
                firstNameValid: false,
                lastNameValid: false,
                usernameFormatValid: false,
                emailFormatValid: false,
                passwordValid: false,
                confirmPasswordValid: false
            };

            for (let i = 1; i <= 5; i++) {
                const stepEl = document.getElementById(`step-${i}`);
                const progressEl = document.getElementById(`progress-${i}`);
                if (stepEl) stepEl.style.display = i === 1 ? 'block' : 'none';
                if (progressEl) {
                    progressEl.classList.remove('active', 'completed');
                    if (i === 1) progressEl.classList.add('active');
                }
            }

            const personalForm = document.getElementById('personal-form');
            const businessForm = document.getElementById('business-form');
            if (personalForm) personalForm.reset();
            if (businessForm) businessForm.reset();

            const fsaGrid = document.getElementById('fsaZonesGrid');
            if (fsaGrid) {
                fsaGrid.innerHTML = `
                <div class="fsa-placeholder">
                    <i class="fas fa-warehouse"></i>
                    <p>Please select a Distribution Center to see available zones</p>
                </div>
            `;
            }
            const fsaCounter = document.getElementById('fsaCounter');
            if (fsaCounter) fsaCounter.style.display = 'none';

            const agreementCheckbox = document.getElementById('agreementCheckbox');
            if (agreementCheckbox) agreementCheckbox.classList.remove('checked');

            hidePaymentError();
            hideStep2Error();

            clearAllErrors();
            clearFieldStatus('userName');
            clearFieldStatus('email');

            const strengthFill = document.getElementById('strength-fill');
            const strengthText = document.getElementById('strength-text');
            if (strengthFill) strengthFill.className = 'strength-fill';
            if (strengthText) strengthText.textContent = '';

            const btn = document.getElementById('step1ContinueBtn');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = 'Continue <i class="fas fa-arrow-right"></i>';
            }
        }

        function nextStep(step) {
            document.getElementById(`step-${currentStep}`).style.display = 'none';
            document.getElementById(`step-${step}`).style.display = 'block';
            document.getElementById(`progress-${currentStep}`).classList.remove('active');
            document.getElementById(`progress-${currentStep}`).classList.add('completed');
            document.getElementById(`progress-${step}`).classList.add('active');
            currentStep = step;
            window.scrollTo(0, 0);

            if (step === 4) updatePaymentSummary();
        }

        function prevStep(step) {
            document.getElementById(`step-${currentStep}`).style.display = 'none';
            document.getElementById(`step-${step}`).style.display = 'block';
            document.getElementById(`progress-${currentStep}`).classList.remove('active');
            document.getElementById(`progress-${step}`).classList.remove('completed');
            document.getElementById(`progress-${step}`).classList.add('active');
            currentStep = step;
            window.scrollTo(0, 0);
            hidePaymentError();
            hideStep2Error();
        }

        // ==================== FORM INTERACTIONS ====================
        function updateFsaZones() {
            const dc = document.getElementById('dcName').value;
            const grid = document.getElementById('fsaZonesGrid');
            const counter = document.getElementById('fsaCounter');
            selectedFsaZones = [];

            if (!dc) {
                grid.innerHTML = `
                <div class="fsa-placeholder">
                    <i class="fas fa-warehouse"></i>
                    <p>Please select a Distribution Center to see available zones</p>
                </div>
            `;
                counter.style.display = 'none';
                return;
            }

            const zones = fsaZonesByDC[dc] || [];
            grid.innerHTML = zones.map(zone => `
            <div class="fsa-item" data-zone="${zone}" onclick="toggleFsa(this)">
                <div class="fsa-checkbox"><i class="fas fa-check"></i></div>
                <span class="fsa-label">${zone}</span>
            </div>
        `).join('');

            counter.style.display = 'flex';
            updateFsaCounter();
        }

        function toggleFsa(element) {
            element.classList.toggle('selected');
            const zone = element.dataset.zone;
            if (element.classList.contains('selected')) {
                if (!selectedFsaZones.includes(zone)) selectedFsaZones.push(zone);
            } else {
                selectedFsaZones = selectedFsaZones.filter(z => z !== zone);
            }
            updateFsaCounter();
            if (selectedFsaZones.length > 0) {
                document.getElementById('fsaZones-error').classList.remove('show');
            }
        }

        function toggleAllFsa() {
            const items = document.querySelectorAll('.fsa-item');
            const allSelected = selectedFsaZones.length === items.length;
            items.forEach(item => {
                if (allSelected) item.classList.remove('selected');
                else item.classList.add('selected');
            });
            selectedFsaZones = allSelected ? [] : Array.from(items).map(item => item.dataset.zone);
            updateFsaCounter();
        }

        function updateFsaCounter() {
            document.getElementById('selectedCount').textContent = selectedFsaZones.length;
        }

        function toggleAgreement() {
            const checkbox = document.getElementById('agreementCheckbox');
            checkbox.classList.toggle('checked');
            agreementAccepted = checkbox.classList.contains('checked');
        }

        function checkPasswordStrength() {
            const password = document.getElementById('password').value;
            const fill = document.getElementById('strength-fill');
            const text = document.getElementById('strength-text');

            fill.className = 'strength-fill';
            text.textContent = '';

            if (password.length === 0) return;

            let strength = 0;
            if (password.length >= 8) strength++;
            if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
            if (/\d/.test(password)) strength++;
            if (/[^a-zA-Z\d]/.test(password)) strength++;

            if (strength <= 1) {
                fill.classList.add('weak');
                text.textContent = 'Weak password';
            } else if (strength <= 2) {
                fill.classList.add('medium');
                text.textContent = 'Medium strength';
            } else {
                fill.classList.add('strong');
                text.textContent = 'Strong password';
            }
        }

        // ==================== ERROR HANDLING ====================
        function showError(fieldId, message) {
            const field = document.getElementById(fieldId);
            const errorEl = document.getElementById(`${fieldId}-error`);
            if (field) field.classList.add('error');
            if (errorEl) {
                errorEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
                errorEl.classList.add('show');
            }
        }

        function clearError(fieldId) {
            const field = document.getElementById(fieldId);
            const errorEl = document.getElementById(`${fieldId}-error`);
            if (field) field.classList.remove('error');
            if (errorEl) errorEl.classList.remove('show');
        }

        function clearAllErrors() {
            document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
            document.querySelectorAll('.error-message').forEach(el => el.classList.remove('show'));
        }

        // ==================== STEP 1 VALIDATION (WITH API CHECK ON CLICK) ====================
        async function validateStep1() {
            const btn = document.getElementById('step1ContinueBtn');
            const originalBtnText = btn.innerHTML;

            clearError('userName');
            clearError('email');
            clearFieldStatus('userName');
            clearFieldStatus('email');

            let localValid = true;

            const firstName = document.getElementById('firstName').value.trim();
            const lastName = document.getElementById('lastName').value.trim();
            const userName = document.getElementById('userName').value.trim();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            if (!firstName) {
                showError('firstName', 'First name is required');
                localValid = false;
            }

            if (!lastName) {
                showError('lastName', 'Last name is required');
                localValid = false;
            }

            const usernameValidation = validateUsernameFormat(userName);
            if (!usernameValidation.valid) {
                showError('userName', usernameValidation.errors[0]);
                localValid = false;
            }

            const emailValidation = validateEmailFormat(email);
            if (!emailValidation.valid) {
                showError('email', emailValidation.errors[0]);
                localValid = false;
            }

            if (!password) {
                showError('password', 'Password is required');
                localValid = false;
            } else if (password.length < 8) {
                showError('password', 'Password must be at least 8 characters');
                localValid = false;
            }

            if (!confirmPassword) {
                showError('confirmPassword', 'Please confirm your password');
                localValid = false;
            } else if (confirmPassword !== password) {
                showError('confirmPassword', 'Passwords do not match');
                localValid = false;
            }

            if (!localValid) {
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validating...';

            updateFieldStatus('userName', 'checking');
            updateFieldStatus('email', 'checking');

            try {
                const validationResults = await validateUsernameAndEmailAvailability(userName, email);

                if (validationResults.usernameAvailable === true) {
                    updateFieldStatus('userName', 'available');
                } else if (validationResults.usernameAvailable === false) {
                    updateFieldStatus('userName', 'taken');
                    showError('userName', validationResults.usernameError);
                } else {
                    updateFieldStatus('userName', 'error');
                    showError('userName', validationResults.usernameError || 'Unable to verify username');
                }

                if (validationResults.emailAvailable === true) {
                    updateFieldStatus('email', 'available');
                } else if (validationResults.emailAvailable === false) {
                    updateFieldStatus('email', 'taken');
                    showError('email', validationResults.emailError);
                } else {
                    updateFieldStatus('email', 'error');
                    showError('email', validationResults.emailError || 'Unable to verify email');
                }

                if (!validationResults.success) {
                    btn.disabled = false;
                    btn.innerHTML = originalBtnText;

                    const firstError = document.querySelector('.error-message.show');
                    if (firstError) {
                        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    return;
                }

                formData.personal = {
                    firstName: firstName,
                    lastName: lastName,
                    email: email.toLowerCase(),
                    userName: userName,
                    password: password
                };

                btn.disabled = false;
                btn.innerHTML = originalBtnText;

                nextStep(2);

            } catch (error) {
                console.error('Validation error:', error);

                btn.disabled = false;
                btn.innerHTML = originalBtnText;

                clearFieldStatus('userName');
                clearFieldStatus('email');
                showError('userName', 'Validation failed. Please try again.');
            }
        }

        // ==================== STEP 2 VALIDATION WITH API REGISTRATION ====================
        async function validateStep2() {
            clearAllErrors();
            hideStep2Error();
            let isValid = true;

            const btn = document.querySelector('#step-2 .btn-next');
            const originalBtnText = btn.innerHTML;

            const businessName = document.getElementById('businessName').value.trim();
            const dcName = document.getElementById('dcName').value;
            const businessEmail = document.getElementById('businessEmail').value.trim();
            const addressOne = document.getElementById('addressOne').value.trim();
            const city = document.getElementById('city').value.trim();
            const province = document.getElementById('province').value;
            const postalCode = document.getElementById('postalCode').value.trim();

            // Local Validations
            if (!businessName) { showError('businessName', 'Business name is required'); isValid = false; }
            if (!dcName) { showError('dcName', 'Please select a DC'); isValid = false; }
            if (!businessEmail || !/\S+@\S+\.\S+/.test(businessEmail)) { showError('businessEmail', 'Valid email is required'); isValid = false; }
            if (!addressOne) { showError('addressOne', 'Address is required'); isValid = false; }
            if (!city) { showError('city', 'City is required'); isValid = false; }
            if (!province) { showError('province', 'Province is required'); isValid = false; }
            if (!postalCode) { showError('postalCode', 'Postal code is required'); isValid = false; }
            if (selectedFsaZones.length === 0) { document.getElementById('fsaZones-error').classList.add('show'); isValid = false; }

            if (!isValid) {
                const firstError = document.querySelector('.error-message.show');
                if (firstError) {
                    firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return;
            }

            // Store business data
            formData.business = {
                businessName,
                dcName,
                email: businessEmail,
                addressOne,
                addressTwo: document.getElementById('addressTwo').value.trim(),
                city,
                province,
                postalCode,
                serviceFsaZones: selectedFsaZones
            };
            console.log('Business Payload:', formData.business);
            // Disable button and show loading
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Account...';
            // showLoading(true);

            try {
                const payload = buildRegistrationPayload();
                console.log('Sending registration payload:', JSON.stringify(payload, null, 2));

                const response = await fetch(`${API_BASE_URL}/dts-client/register`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                let data;
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    data = await response.json();
                } else {
                    const text = await response.text();
                    data = { message: text || 'Unknown error occurred' };
                }

                if (!response.ok) {
                    // Parse the error response
                    const parsedError = parseApiError(data);

                    // showLoading(false);
                    btn.disabled = false;
                    btn.innerHTML = originalBtnText;

                    // Handle field-specific errors
                    if (parsedError.fieldErrors.length > 0) {
                        let hasStep1Error = false;
                        let firstErrorField = null;

                        parsedError.fieldErrors.forEach(fe => {
                            // Check if error belongs to Step 1
                            if (fe.step === 1) {
                                hasStep1Error = true;
                            }

                            // Show error on the field
                            showError(fe.field, fe.message);
                            updateFieldStatus(fe.field, 'taken');

                            if (!firstErrorField) {
                                firstErrorField = fe.field;
                            }
                        });

                        // If error is from Step 1, go back to Step 1
                        if (hasStep1Error) {
                            prevStep(1);
                            setTimeout(() => {
                                const firstError = document.querySelector('#step-1 .error-message.show');
                                if (firstError) {
                                    firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                            }, 100);
                            return;
                        }

                        // Scroll to first error field in Step 2
                        const errorField = document.getElementById(firstErrorField);
                        if (errorField) {
                            errorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            errorField.focus();
                        }
                    }

                    // Show general error banner if no field errors or as additional info
                    if (parsedError.generalMessage) {
                        showStep2Error(parsedError.generalMessage);
                    } else if (parsedError.fieldErrors.length === 0) {
                        showStep2Error('Registration failed. Please check your information and try again.');
                    }

                    return;
                }

                // Success - store response and proceed
                formData.response = data;
                // showLoading(false);
                btn.disabled = false;
                btn.innerHTML = originalBtnText;

                // Update success page data
                updateSuccessPage(data);

                // Proceed to Agreement step
                nextStep(3);

            } catch (error) {
                console.error('Registration error:', error);
                // showLoading(false);
                btn.disabled = false;
                btn.innerHTML = originalBtnText;
                showStep2Error(error.message || 'An unexpected error occurred. Please try again.');
            }
        }

        // ==================== STEP 2 ERROR HANDLING ====================
        function showStep2Error(message) {
            let errorBanner = document.getElementById('step2-error-banner');

            if (!errorBanner) {
                errorBanner = document.createElement('div');
                errorBanner.id = 'step2-error-banner';
                errorBanner.style.cssText = `
                background: rgba(255, 77, 77, 0.1);
                border: 1px solid rgba(255, 77, 77, 0.3);
                color: #ff4d4d;
                padding: 1rem 1.5rem;
                border-radius: 12px;
                margin-bottom: 1.5rem;
                display: flex;
                align-items: flex-start;
                gap: 0.75rem;
            `;
                const cardBody = document.querySelector('#step-2 .card-body');
                cardBody.insertBefore(errorBanner, cardBody.firstChild);
            }

            errorBanner.innerHTML = `
            <i class="fas fa-exclamation-circle" style="margin-top: 2px; flex-shrink: 0;"></i>
            <div style="flex: 1;">
                <strong>Registration Failed</strong>
                <p style="margin: 0.25rem 0 0 0; font-size: 0.9rem; opacity: 0.9;">${message}</p>
            </div>
            <button onclick="hideStep2Error()" style="background:none;border:none;color:#ff4d4d;cursor:pointer;padding:0.5rem;">
                <i class="fas fa-times"></i>
            </button>
        `;
            errorBanner.style.display = 'flex';
            errorBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        function hideStep2Error() {
            const errorBanner = document.getElementById('step2-error-banner');
            if (errorBanner) errorBanner.style.display = 'none';
        }

        function validateStep3() {
            if (agreementAccepted) {
                nextStep(4);
            } else {
                alert('Please accept the Master Service Agreement to continue.');
            }
        }

        function updatePaymentSummary() {
            document.getElementById('summary-name').textContent =
                `${formData.personal.firstName} ${formData.personal.lastName}`;
            document.getElementById('summary-email').textContent = formData.personal.email;
            document.getElementById('summary-business').textContent = formData.business.businessName;
            document.getElementById('summary-dc').textContent = formData.business.dcName;
        }

        // ==================== API INTEGRATION ====================
        function buildRegistrationPayload() {
            return {
                firstName: formData.personal.firstName,
                lastName: formData.personal.lastName,
                email: formData.personal.email,
                login: formData.personal.userName,
                tempPassword: formData.personal.password,
                tfaEnabled: false,
                distributionCenterResponseVm: { dcName: formData.business.dcName },
                authorities: ['ROLE_CLIENT_DTS'],
                activated: true,
                businessName: formData.business.businessName,
                dcName: formData.business.dcName,
                clientCode: formData.business.businessName.substring(0, 3).toUpperCase() + Date.now().toString().slice(-4),
                companyCode: formData.business.businessName.substring(0, 4).toUpperCase() + Date.now().toString().slice(-3),
                serviceDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
                deliveryDateBuffer: 0,
                eligibilityDay: 0,
                expectedManifests: 5,
                manifestCutoffTime: "14:00:00",
                businessEmail: formData.business.email,
                addressOne: formData.business.addressOne,
                addressTwo: formData.business.addressTwo || "",
                city: formData.business.city,
                province: formData.business.province,
                postalCode: formData.business.postalCode,
                serviceFsaZones: formData.business.serviceFsaZones
            };
        }

        function showLoading(show = true) {
            const overlay = document.getElementById('loadingOverlay');
            if (show) overlay.classList.add('active');
            else overlay.classList.remove('active');
        }

        // ==================== SIMPLIFIED PAYMENT (No API Call) ====================
        async function processPayment() {
            const btn = document.getElementById('payBtn');
            const originalBtnText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            btn.disabled = true;

            hidePaymentError();
            // showLoading(true);

            try {
                // Simulate payment processing (replace with actual payment gateway integration)
                await new Promise(resolve => setTimeout(resolve, 1500));

                // showLoading(false);
                nextStep(5); // Go to success page

            } catch (error) {
                console.error('Payment error:', error);
                // showLoading(false);
                btn.innerHTML = originalBtnText;
                btn.disabled = false;
                showPaymentError(error.message || 'Payment failed. Please try again.');
            }
        }

        function updateSuccessPage(responseData) {
            document.getElementById('confirm-email').textContent = responseData.email || formData.personal.email;
            document.getElementById('confirm-business').textContent = responseData.businessName || formData.business.businessName;

            const accountIdEl = document.getElementById('confirm-accountId');
            if (accountIdEl) {
                if (responseData.accountId) accountIdEl.textContent = responseData.accountId;
                else if (responseData.customerId) accountIdEl.textContent = `KR-${responseData.customerId}`;
                else if (responseData.userId) accountIdEl.textContent = `KR-USR-${responseData.userId}`;
                else if (responseData.id) accountIdEl.textContent = `KR-${responseData.id}`;
                else accountIdEl.textContent = `KR-SMB-${Date.now().toString().slice(-5)}`;
            }

            formData.response = responseData;
        }

        function showPaymentError(message) {
            let errorBanner = document.getElementById('payment-error-banner');

            if (!errorBanner) {
                errorBanner = document.createElement('div');
                errorBanner.id = 'payment-error-banner';
                errorBanner.style.cssText = `
                background: rgba(255, 77, 77, 0.1);
                border: 1px solid rgba(255, 77, 77, 0.3);
                color: #ff4d4d;
                padding: 1rem 1.5rem;
                border-radius: 12px;
                margin-bottom: 1.5rem;
                display: flex;
                align-items: flex-start;
                gap: 0.75rem;
            `;
                const cardBody = document.querySelector('#step-4 .card-body');
                cardBody.insertBefore(errorBanner, cardBody.firstChild);
            }

            errorBanner.innerHTML = `
            <i class="fas fa-exclamation-circle" style="margin-top: 2px; flex-shrink: 0;"></i>
            <div style="flex: 1;">
                <strong>Payment Failed</strong>
                <p style="margin: 0.25rem 0 0 0; font-size: 0.9rem; opacity: 0.9;">${message}</p>
            </div>
            <button onclick="hidePaymentError()" style="background:none;border:none;color:#ff4d4d;cursor:pointer;padding:0.5rem;">
                <i class="fas fa-times"></i>
            </button>
        `;
            errorBanner.style.display = 'flex';
            errorBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        function hidePaymentError() {
            const errorBanner = document.getElementById('payment-error-banner');
            if (errorBanner) errorBanner.style.display = 'none';
        }

        function goToDashboard() {
            window.location.href = 'https://qa.koorierinc.net/login';
        }

        // ==================== ANIMATIONS ====================
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

        document.querySelectorAll('.feature-card, .pricing-card').forEach(el => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(20px)';
            el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(el);
        });

        console.log('Koorier DTS Registration Page Loaded');
