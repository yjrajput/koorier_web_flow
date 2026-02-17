// ==================== API CONFIGURATION ====================
const API_BASE_URL = 'https://integapi.koorierinc.net/qa/api';
const PUBLIC_API_BASE_URL = 'https://integapi.koorierinc.net/qa/public/api';

// ==================== PAYMENT CONFIGURATION ====================
const ONBOARDING_FEE = 50.00;
const TAX_RATE = 0.00;
const TOTAL_WITH_TAX = ONBOARDING_FEE * (1 + TAX_RATE);
const CURRENCY = 'CAD';

// Session storage key
const SESSION_STORAGE_KEY = 'koorier_onboarding_session';

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
const errorFieldMapping = {
    'BUSINESS_EMAIL_ALREADY_EXISTS': { field: 'businessEmail', message: 'This business email is already registered' },
    'Business email already exists': { field: 'businessEmail', message: 'This business email is already registered' },
    'EMAIL_ALREADY_EXISTS': { field: 'email', message: 'This email is already registered', step: 1 },
    'Email already exists': { field: 'email', message: 'This email is already registered', step: 1 },
    'LOGIN_ALREADY_EXISTS': { field: 'userName', message: 'This username is already taken', step: 1 },
    'USERNAME_ALREADY_EXISTS': { field: 'userName', message: 'This username is already taken', step: 1 },
    'Login already exists': { field: 'userName', message: 'This username is already taken', step: 1 },
    'Username already exists': { field: 'userName', message: 'This username is already taken', step: 1 },
    'BUSINESS_NAME_ALREADY_EXISTS': { field: 'businessName', message: 'This business name is already registered' },
    'Business name already exists': { field: 'businessName', message: 'This business name is already registered' },
    'CLIENT_CODE_ALREADY_EXISTS': { field: 'businessName', message: 'A business with similar name already exists' },
    'Client code already exists': { field: 'businessName', message: 'A business with similar name already exists' },
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

// ==================== PAYMENT STATE ====================
let paymentState = {
    customerId: null,
    walletBalance: 0,
    promoApplied: null,
    promoCredit: 0,
    amountDue: TOTAL_WITH_TAX,
    selectedMethod: 'stripe',
    processing: false,
    currentLedgerEntryId: null,
    currentGatewayOrderId: null
};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', function () {
    console.log('DOM Content Loaded - Initializing...');

    // IMPORTANT: Check for payment return FIRST before anything else
    const urlParams = new URLSearchParams(window.location.search);
    const isPaymentReturn = urlParams.has('payment') || urlParams.has('session_id') || urlParams.has('token');

    if (isPaymentReturn) {
        console.log('Detected payment return, handling...');
        handlePaymentReturn();
        return; // Don't initialize normal flow
    }

    // Normal initialization
    initializeFormListeners();
    initializeAnimations();
    updateContinueButtonState();

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href !== '#' && document.querySelector(href)) {
                e.preventDefault();
                document.querySelector(href).scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
});

function initializeFormListeners() {
    const fields = {
        'firstName': handleFirstNameInput,
        'lastName': handleLastNameInput,
        'userName': handleUsernameInput,
        'email': handleEmailInput,
        'password': handlePasswordInput,
        'confirmPassword': handleConfirmPasswordInput
    };

    Object.entries(fields).forEach(([id, handler]) => {
        const field = document.getElementById(id);
        if (field) {
            field.addEventListener('input', handler);
            field.addEventListener('blur', handler);
        }
    });
}

function initializeAnimations() {
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
}

// ==================== UTILITY FUNCTIONS ====================
function generateReferenceId() {
    return `ONBOARD-${paymentState.customerId}-${Date.now()}`;
}

function showLoading(show = true, message = 'Processing...') {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');

    if (!overlay) {
        console.warn('Loading overlay not found');
        return;
    }

    if (loadingText) loadingText.textContent = message;

    if (show) {
        overlay.style.display = 'flex';
        overlay.classList.add('active');
    } else {
        overlay.classList.remove('active');
        overlay.style.display = 'none';
    }
}

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

// ==================== VALIDATION FUNCTIONS ====================
function validateUsernameFormat(username) {
    const errors = [];
    if (!username || username.trim() === '') {
        return { valid: false, errors: ['Username is required'] };
    }
    username = username.trim();
    if (username.length < 3) errors.push('Username must be at least 3 characters');
    if (username.length > 50) errors.push('Username cannot exceed 50 characters');
    if (/\s/.test(username)) errors.push('Username cannot contain spaces');
    if (!/^[a-zA-Z0-9._-]+$/.test(username)) errors.push('Only letters, numbers, dot, underscore, and hyphen allowed');
    if (!/^[a-zA-Z0-9]/.test(username)) errors.push('Username must start with a letter or number');
    if (!/[a-zA-Z0-9]$/.test(username)) errors.push('Username must end with a letter or number');
    if (/\.{2,}|_{2,}|-{2,}/.test(username)) errors.push('No consecutive special characters allowed');
    return { valid: errors.length === 0, errors };
}

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
            { method: 'GET', headers: { 'Accept': 'application/json' } }
        );

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        const usernameExists = data.loginExists ?? data.usernameExists ?? !data.usernameAvailable ?? !data.loginAvailable ?? false;
        const emailExists = data.emailExists ?? !data.emailAvailable ?? false;

        results.usernameAvailable = !usernameExists;
        results.emailAvailable = !emailExists;
        if (usernameExists) results.usernameError = 'Username is already taken. Please choose another.';
        if (emailExists) results.emailError = 'Email is already registered. Please use another email or login.';
        results.success = !usernameExists && !emailExists;

    } catch (error) {
        console.error('Validation API error:', error);
        results.usernameError = 'Unable to verify credentials. Please try again.';
        results.emailError = 'Unable to verify credentials. Please try again.';
        results.success = false;
    }

    return results;
}

// ==================== ERROR PARSING ====================
function parseApiError(data) {
    const result = { fieldErrors: [], generalMessage: 'Registration failed. Please try again.' };

    if (data.detail) {
        const mapping = errorFieldMapping[data.detail];
        if (mapping) {
            result.fieldErrors.push(mapping);
            result.generalMessage = null;
        } else {
            result.generalMessage = data.detail.replace(/_/g, ' ').toLowerCase();
            result.generalMessage = result.generalMessage.charAt(0).toUpperCase() + result.generalMessage.slice(1);
        }
    }

    if (data.title && result.fieldErrors.length === 0) {
        const mapping = errorFieldMapping[data.title];
        if (mapping) {
            result.fieldErrors.push(mapping);
            result.generalMessage = null;
        } else if (!data.detail) {
            result.generalMessage = data.title;
        }
    }

    if (data.message && result.fieldErrors.length === 0) {
        const mapping = errorFieldMapping[data.message];
        if (mapping) {
            result.fieldErrors.push(mapping);
            result.generalMessage = null;
        } else if (!data.detail && !data.title) {
            result.generalMessage = data.message;
        }
    }

    if (data.errors && typeof data.errors === 'object') {
        Object.entries(data.errors).forEach(([field, messages]) => {
            const messageArray = Array.isArray(messages) ? messages : [messages];
            messageArray.forEach(msg => result.fieldErrors.push({ field, message: msg }));
        });
        if (result.fieldErrors.length > 0) result.generalMessage = null;
    }

    if (data.fieldErrors && Array.isArray(data.fieldErrors)) {
        data.fieldErrors.forEach(fe => {
            result.fieldErrors.push({ field: fe.field || fe.objectName, message: fe.message || fe.defaultMessage });
        });
        if (result.fieldErrors.length > 0) result.generalMessage = null;
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
        position: absolute; right: 1rem; top: 50%;
        transform: translateY(-50%); font-size: 0.9rem; z-index: 10;
    `;

    const icons = {
        'checking': '<i class="fas fa-spinner fa-spin" style="color: var(--primary-main);"></i>',
        'available': '<i class="fas fa-check-circle" style="color: var(--success-green);"></i>',
        'taken': '<i class="fas fa-times-circle" style="color: var(--error-red);"></i>',
        'error': '<i class="fas fa-exclamation-triangle" style="color: #fbbf24;"></i>',
        'valid': '<i class="fas fa-check" style="color: var(--success-green);"></i>'
    };

    if (icons[status]) {
        indicator.innerHTML = icons[status];
        wrapper.style.position = 'relative';
        wrapper.appendChild(indicator);
    }
}

function clearFieldStatus(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    const wrapper = field.closest('.input-wrapper');
    if (!wrapper) return;
    const existingIndicator = wrapper.querySelector('.field-status');
    if (existingIndicator) existingIndicator.remove();
}

// ==================== INPUT HANDLERS ====================
function handleFirstNameInput(event) {
    const value = event.target.value.trim();
    clearError('firstName');
    if (!value) {
        validationState.firstNameValid = false;
        showError('firstName', 'First name is required');
    } else {
        validationState.firstNameValid = true;
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
    }
    updateContinueButtonState();
}

function checkPasswordStrength() {
    const password = document.getElementById('password').value;
    const fill = document.getElementById('strength-fill');
    const text = document.getElementById('strength-text');

    if (!fill || !text) return;

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
        firstNameValid: false, lastNameValid: false, usernameFormatValid: false,
        emailFormatValid: false, passwordValid: false, confirmPasswordValid: false
    };

    paymentState = {
        customerId: null, walletBalance: 0, promoApplied: null, promoCredit: 0,
        amountDue: TOTAL_WITH_TAX, selectedMethod: 'stripe', processing: false,
        currentLedgerEntryId: null, currentGatewayOrderId: null
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

    // Clear session storage
    clearPaymentSession();
}

function nextStep(step) {
    const currentStepEl = document.getElementById(`step-${currentStep}`);
    const nextStepEl = document.getElementById(`step-${step}`);
    const currentProgressEl = document.getElementById(`progress-${currentStep}`);
    const nextProgressEl = document.getElementById(`progress-${step}`);

    if (currentStepEl) currentStepEl.style.display = 'none';
    if (nextStepEl) nextStepEl.style.display = 'block';
    if (currentProgressEl) {
        currentProgressEl.classList.remove('active');
        currentProgressEl.classList.add('completed');
    }
    if (nextProgressEl) nextProgressEl.classList.add('active');

    currentStep = step;
    window.scrollTo(0, 0);

    if (step === 4) {
        initializePaymentStep();
    }
}

function prevStep(step) {
    const currentStepEl = document.getElementById(`step-${currentStep}`);
    const prevStepEl = document.getElementById(`step-${step}`);
    const currentProgressEl = document.getElementById(`progress-${currentStep}`);
    const prevProgressEl = document.getElementById(`progress-${step}`);

    if (currentStepEl) currentStepEl.style.display = 'none';
    if (prevStepEl) prevStepEl.style.display = 'block';
    if (currentProgressEl) currentProgressEl.classList.remove('active');
    if (prevProgressEl) {
        prevProgressEl.classList.remove('completed');
        prevProgressEl.classList.add('active');
    }

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
    const countEl = document.getElementById('selectedCount');
    if (countEl) countEl.textContent = selectedFsaZones.length;
}

function toggleAgreement() {
    const checkbox = document.getElementById('agreementCheckbox');
    checkbox.classList.toggle('checked');
    agreementAccepted = checkbox.classList.contains('checked');
}

// ==================== STEP VALIDATION ====================
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

    if (!firstName) { showError('firstName', 'First name is required'); localValid = false; }
    if (!lastName) { showError('lastName', 'Last name is required'); localValid = false; }

    const usernameValidation = validateUsernameFormat(userName);
    if (!usernameValidation.valid) { showError('userName', usernameValidation.errors[0]); localValid = false; }

    const emailValidation = validateEmailFormat(email);
    if (!emailValidation.valid) { showError('email', emailValidation.errors[0]); localValid = false; }

    if (!password) { showError('password', 'Password is required'); localValid = false; }
    else if (password.length < 8) { showError('password', 'Password must be at least 8 characters'); localValid = false; }

    if (!confirmPassword) { showError('confirmPassword', 'Please confirm your password'); localValid = false; }
    else if (confirmPassword !== password) { showError('confirmPassword', 'Passwords do not match'); localValid = false; }

    if (!localValid) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validating...';
    updateFieldStatus('userName', 'checking');
    updateFieldStatus('email', 'checking');

    try {
        const validationResults = await validateUsernameAndEmailAvailability(userName, email);

        updateFieldStatus('userName', validationResults.usernameAvailable === true ? 'available' :
            validationResults.usernameAvailable === false ? 'taken' : 'error');
        updateFieldStatus('email', validationResults.emailAvailable === true ? 'available' :
            validationResults.emailAvailable === false ? 'taken' : 'error');

        if (validationResults.usernameAvailable === false) showError('userName', validationResults.usernameError);
        if (validationResults.emailAvailable === false) showError('email', validationResults.emailError);

        if (!validationResults.success) {
            btn.disabled = false;
            btn.innerHTML = originalBtnText;
            const firstError = document.querySelector('.error-message.show');
            if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        formData.personal = { firstName, lastName, email: email.toLowerCase(), userName, password };
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
        if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    formData.business = {
        businessName, dcName, email: businessEmail, addressOne,
        addressTwo: document.getElementById('addressTwo').value.trim(),
        city, province, postalCode, serviceFsaZones: selectedFsaZones
    };

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Account...';
    showLoading(true, 'Creating your account...');

    try {
        const payload = buildRegistrationPayload();
        console.log('Sending registration payload:', JSON.stringify(payload, null, 2));

        const response = await fetch(`${API_BASE_URL}/dts-client/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
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
            const parsedError = parseApiError(data);
            showLoading(false);
            btn.disabled = false;
            btn.innerHTML = originalBtnText;

            if (parsedError.fieldErrors.length > 0) {
                let hasStep1Error = false;
                let firstErrorField = null;

                parsedError.fieldErrors.forEach(fe => {
                    if (fe.step === 1) hasStep1Error = true;
                    showError(fe.field, fe.message);
                    updateFieldStatus(fe.field, 'taken');
                    if (!firstErrorField) firstErrorField = fe.field;
                });

                if (hasStep1Error) {
                    prevStep(1);
                    setTimeout(() => {
                        const firstError = document.querySelector('#step-1 .error-message.show');
                        if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 100);
                    return;
                }

                const errorField = document.getElementById(firstErrorField);
                if (errorField) {
                    errorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    errorField.focus();
                }
            }

            if (parsedError.generalMessage) {
                showStep2Error(parsedError.generalMessage);
            } else if (parsedError.fieldErrors.length === 0) {
                showStep2Error('Registration failed. Please check your information and try again.');
            }
            return;
        }

        formData.response = data;
        showLoading(false);
        btn.disabled = false;
        btn.innerHTML = originalBtnText;
        updateSuccessPage(data);
        nextStep(3);

    } catch (error) {
        console.error('Registration error:', error);
        showLoading(false);
        btn.disabled = false;
        btn.innerHTML = originalBtnText;
        showStep2Error(error.message || 'An unexpected error occurred. Please try again.');
    }
}

function validateStep3() {
    if (agreementAccepted) {
        nextStep(4);
    } else {
        alert('Please accept the Master Service Agreement to continue.');
    }
}

// ==================== STEP 2 ERROR HANDLING ====================
function showStep2Error(message) {
    let errorBanner = document.getElementById('step2-error-banner');
    if (!errorBanner) {
        errorBanner = document.createElement('div');
        errorBanner.id = 'step2-error-banner';
        errorBanner.style.cssText = `
            background: rgba(255, 77, 77, 0.1); border: 1px solid rgba(255, 77, 77, 0.3);
            color: #ff4d4d; padding: 1rem 1.5rem; border-radius: 12px;
            margin-bottom: 1.5rem; display: flex; align-items: flex-start; gap: 0.75rem;
        `;
        const cardBody = document.querySelector('#step-2 .card-body');
        if (cardBody) cardBody.insertBefore(errorBanner, cardBody.firstChild);
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
        activated: false,
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

function updateSuccessPage(responseData) {
    const confirmEmail = document.getElementById('confirm-email');
    const confirmBusiness = document.getElementById('confirm-business');
    const accountIdEl = document.getElementById('confirm-accountId');

    if (confirmEmail) confirmEmail.textContent = responseData.email || formData.personal.email;
    if (confirmBusiness) confirmBusiness.textContent = responseData.businessName || formData.business.businessName;

    if (accountIdEl) {
        if (responseData.accountId) accountIdEl.textContent = responseData.accountId;
        else if (responseData.customerId) accountIdEl.textContent = `KR-${responseData.customerId}`;
        else if (responseData.userId) accountIdEl.textContent = `KR-USR-${responseData.userId}`;
        else if (responseData.id) accountIdEl.textContent = `KR-${responseData.id}`;
        else accountIdEl.textContent = `KR-SMB-${Date.now().toString().slice(-5)}`;
    }

    formData.response = responseData;
}

// ==================== PAYMENT STEP INITIALIZATION ====================
function initializePaymentStep() {
    console.log('Initializing payment step...');

    if (formData.response && (formData.response.customerId || formData.response.id)) {
        paymentState.customerId = formData.response.customerId || formData.response.id;
    }

    if (!paymentState.customerId) {
        showPaymentError('Registration incomplete. Please go back and try again.');
        return;
    }

    // Reset payment state
    paymentState.walletBalance = 0;
    paymentState.promoApplied = null;
    paymentState.promoCredit = 0;
    paymentState.amountDue = TOTAL_WITH_TAX;
    paymentState.processing = false;
    paymentState.currentLedgerEntryId = null;
    paymentState.currentGatewayOrderId = null;

    // Reset UI
    hideAppliedPromo();
    hidePromoError();
    hidePaymentError();
    updatePaymentDisplay();
    selectPaymentMethod('stripe');

    console.log('Payment step initialized for customer:', paymentState.customerId);
}

// ==================== PAYMENT METHOD SELECTION ====================
function selectPaymentMethod(method) {
    console.log('Selecting payment method:', method);
    paymentState.selectedMethod = method;

    // Update option buttons
    document.querySelectorAll('.payment-option').forEach(option => {
        option.classList.toggle('activee', option.dataset.method === method);
    });

    updatePayButton();
}

// ==================== PROMO CODE FUNCTIONS ====================
async function applyPromoCode() {
    const promoInput = document.getElementById('promoCodeInput');
    const promoCode = promoInput.value.trim().toUpperCase();
    const applyBtn = document.getElementById('applyPromoBtn');

    if (!promoCode) {
        showPromoError('Please enter a promo code');
        return;
    }

    if (!paymentState.customerId) {
        showPromoError('Registration not complete. Please go back and try again.');
        return;
    }

    applyBtn.disabled = true;
    applyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    hidePromoError();

    try {
        const validateResponse = await fetch(
            `${API_BASE_URL}/v1/promo/validate?code=${encodeURIComponent(promoCode)}&customerId=${paymentState.customerId}`
        );
        const validateData = await validateResponse.json();

        if (!validateData.valid) {
            showPromoError(validateData.errorMessage || 'Invalid promo code');
            return;
        }

        const applyResponse = await fetch(`${API_BASE_URL}/v1/promo/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customerId: paymentState.customerId,
                promoCode: promoCode
            })
        });

        if (!applyResponse.ok) {
            const errorData = await applyResponse.json();
            throw new Error(errorData.detail || errorData.message || 'Failed to apply promo code');
        }

        const applyData = await applyResponse.json();

        paymentState.promoApplied = promoCode;
        paymentState.walletBalance = parseFloat(applyData.balanceAfter) || 0;
        paymentState.promoCredit = parseFloat(validateData.calculatedDiscount) || parseFloat(applyData.amount) || 0;

        showAppliedPromo(promoCode, paymentState.promoCredit);
        updatePaymentDisplay();

        console.log('Promo applied:', {
            code: promoCode,
            credit: paymentState.promoCredit,
            walletBalance: paymentState.walletBalance,
            amountDue: paymentState.amountDue
        });

    } catch (error) {
        console.error('Promo apply error:', error);
        showPromoError(error.message || 'Failed to apply promo code');
    } finally {
        applyBtn.disabled = false;
        applyBtn.innerHTML = 'Apply';
    }
}

async function removePromoCode() {
    if (!paymentState.promoApplied || !paymentState.customerId) return;

    const removeBtn = document.querySelector('#promoAppliedInline .btn-remove');
    if (removeBtn) {
        removeBtn.disabled = true;
        removeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        const response = await fetch(
            `${API_BASE_URL}/v1/promo/remove?customerId=${paymentState.customerId}&promoCode=${encodeURIComponent(paymentState.promoApplied)}`,
            { method: 'POST' }
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to remove promo code');
        }

        const data = await response.json();

        paymentState.promoApplied = null;
        paymentState.promoCredit = 0;
        paymentState.walletBalance = parseFloat(data.balanceAfter) || 0;

        hideAppliedPromo();
        updatePaymentDisplay();

        console.log('Promo removed, new balance:', paymentState.walletBalance);

    } catch (error) {
        console.error('Promo remove error:', error);
        showPromoError(error.message || 'Failed to remove promo code');
    } finally {
        if (removeBtn) {
            removeBtn.disabled = false;
            removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        }
    }
}

function showPromoError(message) {
    const errorBanner = document.getElementById('promoErrorBanner');
    const errorText = document.getElementById('promoErrorText');
    if (errorText) errorText.textContent = message;
    if (errorBanner) errorBanner.style.display = 'flex';
}

function hidePromoError() {
    const errorBanner = document.getElementById('promoErrorBanner');
    if (errorBanner) errorBanner.style.display = 'none';
}

function showAppliedPromo(code, amount) {
    const inputGroup = document.getElementById('promoInlineGroup');
    const appliedGroup = document.getElementById('promoAppliedInline');
    const appliedBadge = document.getElementById('appliedPromoCodeBadge');
    const successBanner = document.getElementById('promoSuccessBanner');
    const successText = document.getElementById('promoSuccessText');

    if (inputGroup) inputGroup.style.display = 'none';
    if (appliedGroup) appliedGroup.style.display = 'flex';
    if (appliedBadge) appliedBadge.textContent = code;
    if (successText) successText.textContent = `Success! $${amount.toFixed(2)} ${CURRENCY} added to your account.`;
    if (successBanner) successBanner.style.display = 'flex';

    hidePromoError();
}

function hideAppliedPromo() {
    const inputGroup = document.getElementById('promoInlineGroup');
    const appliedGroup = document.getElementById('promoAppliedInline');
    const successBanner = document.getElementById('promoSuccessBanner');
    const promoInput = document.getElementById('promoCodeInput');

    if (inputGroup) inputGroup.style.display = 'flex';
    if (appliedGroup) appliedGroup.style.display = 'none';
    if (successBanner) successBanner.style.display = 'none';
    if (promoInput) promoInput.value = '';

    hidePromoError();
}

// ==================== PAYMENT DISPLAY UPDATE ====================
function updatePaymentDisplay() {
    const promoDiscountRow = document.getElementById('promoDiscountRow');
    const promoCodeDisplay = document.getElementById('promoCodeDisplay');
    const promoDiscountValue = document.getElementById('promoDiscountValue');
    const walletDeductionRow = document.getElementById('walletDeductionRow');
    const walletDeductionValue = document.getElementById('walletDeductionValue');
    const totalDueValue = document.getElementById('totalDueValue');
    const paymentMethodSection = document.getElementById('paymentMethodSection');
    const noPaymentMessage = document.getElementById('noPaymentMessage');

    const walletUsed = Math.min(paymentState.walletBalance, TOTAL_WITH_TAX);
    paymentState.amountDue = Math.max(0, TOTAL_WITH_TAX - paymentState.walletBalance);

    if (paymentState.promoApplied && paymentState.promoCredit > 0) {
        if (promoDiscountRow) promoDiscountRow.style.display = 'flex';
        if (promoCodeDisplay) promoCodeDisplay.textContent = paymentState.promoApplied;
        if (promoDiscountValue) promoDiscountValue.textContent = `-$${paymentState.promoCredit.toFixed(2)} ${CURRENCY}`;
    } else {
        if (promoDiscountRow) promoDiscountRow.style.display = 'none';
    }

    if (walletUsed > 0) {
        if (walletDeductionRow) walletDeductionRow.style.display = 'flex';
        if (walletDeductionValue) walletDeductionValue.textContent = `-$${walletUsed.toFixed(2)} ${CURRENCY}`;
    } else {
        if (walletDeductionRow) walletDeductionRow.style.display = 'none';
    }

    if (totalDueValue) totalDueValue.textContent = `$${paymentState.amountDue.toFixed(2)} ${CURRENCY}`;

    if (paymentState.amountDue <= 0) {
        if (paymentMethodSection) paymentMethodSection.style.display = 'none';
        if (noPaymentMessage) noPaymentMessage.style.display = 'flex';
    } else {
        if (paymentMethodSection) paymentMethodSection.style.display = 'block';
        if (noPaymentMessage) noPaymentMessage.style.display = 'none';
    }

    updatePayButton();
}

function updatePayButton() {
    const payBtn = document.getElementById('payBtn');
    const payBtnText = document.getElementById('payBtnText');
    if (!payBtn) return;

    if (paymentState.amountDue <= 0) {
        if (payBtnText) payBtnText.textContent = 'Complete Registration';
        payBtn.classList.add('success');
    } else {
        if (payBtnText) payBtnText.textContent = `Pay $${paymentState.amountDue.toFixed(2)} ${CURRENCY}`;
        payBtn.classList.remove('success');
    }
}

// ==================== SESSION STORAGE ====================
function storeSessionForPaymentReturn(referenceId, paymentData) {
    const sessionData = {
        formData: formData,
        paymentState: {
            customerId: paymentState.customerId,
            promoApplied: paymentState.promoApplied,
            promoCredit: paymentState.promoCredit,
            walletBalance: paymentState.walletBalance,
            amountDue: paymentState.amountDue
        },
        referenceId: referenceId,
        gatewayOrderId: paymentData.gatewayOrderId, // This is the Stripe Session ID
        ledgerEntryId: paymentData.ledgerEntryId,
        gateway: paymentData.gateway, // 'STRIPE' or 'PAYPAL'
        timestamp: Date.now()
    };

    try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
        console.log('Session stored:', sessionData);
    } catch (error) {
        console.error('Failed to store session:', error);
    }
}

function restoreSessionFromStorage() {
    try {
        const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
        console.log('Retrieved from storage:', stored);

        if (!stored) {
            console.log('No session data found in storage');
            return null;
        }

        const data = JSON.parse(stored);

        // Check if session is not too old (30 minutes)
        const ageMinutes = (Date.now() - data.timestamp) / (1000 * 60);
        console.log('Session age:', ageMinutes, 'minutes');

        if (ageMinutes > 30) {
            console.log('Session expired, clearing...');
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
            return null;
        }

        return data;

    } catch (error) {
        console.error('Failed to parse session data:', error);
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        return null;
    }
}

function clearPaymentSession() {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    console.log('Payment session cleared');
}

// ==================== MAIN PAYMENT PROCESSING ====================
async function processPayment() {
    if (paymentState.processing) {
        console.log('Payment already processing, ignoring...');
        return;
    }

    const payBtn = document.getElementById('payBtn');
    const payBtnText = document.getElementById('payBtnText');
    const originalText = payBtnText ? payBtnText.textContent : 'Pay';

    paymentState.processing = true;
    if (payBtn) payBtn.disabled = true;
    if (payBtnText) payBtnText.textContent = 'Processing...';
    hidePaymentError();

    try {
        const referenceId = generateReferenceId();
        const baseUrl = window.location.origin + window.location.pathname;

        // Base URLs without gateway-specific params
        const baseSuccessUrl = `${baseUrl}?payment=success&ref=${encodeURIComponent(referenceId)}`;
        const cancelUrl = `${baseUrl}?payment=cancelled&ref=${encodeURIComponent(referenceId)}`;

        // Gateway-specific success URLs
        let successUrl;
        if (paymentState.selectedMethod === 'stripe') {
            // Stripe replaces {CHECKOUT_SESSION_ID} with actual session ID
            successUrl = `${baseSuccessUrl}&session_id={CHECKOUT_SESSION_ID}`;
        } else {
            // PayPal appends token automatically, keep URL clean
            successUrl = baseSuccessUrl;
        }

        console.log('Success URL:', successUrl);
        console.log('Cancel URL:', cancelUrl);

        const paymentRequest = {
            customerId: paymentState.customerId,
            amount: TOTAL_WITH_TAX,
            context: 'REGISTRATION',
            referenceId: referenceId,
            preferredGateway: paymentState.amountDue > 0 ? paymentState.selectedMethod.toUpperCase() : null,
            currency: CURRENCY,
            successUrl: successUrl,
            cancelUrl: cancelUrl,
            description: 'Koorier DTS Onboarding Fee'
        };

        console.log('Processing payment:', paymentRequest);
        showLoading(true, 'Initializing payment...');

        const response = await fetch(`${API_BASE_URL}/v1/payment/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(paymentRequest)
        });

        const data = await response.json();
        console.log('Payment response:', data);

        // CASE 1: Payment completed via wallet
        if (data.success && !data.gatewayPaymentRequired) {
            console.log('Payment completed via wallet');
            showLoading(false);
            handlePaymentSuccess(data);
            return;
        }

        // CASE 2: Gateway payment required - redirect
        if (data.gatewayPaymentRequired && data.checkoutUrl) {
            console.log(`Redirecting to ${data.gateway} checkout:`, data.checkoutUrl);

            // Store session BEFORE redirecting
            storeSessionForPaymentReturn(referenceId, data);

            showLoading(true, `Redirecting to ${data.gateway === 'STRIPE' ? 'Stripe' : 'PayPal'}...`);

            // Small delay to ensure session is stored
            setTimeout(() => {
                window.location.href = data.checkoutUrl;
            }, 100);
            return;
        }

        throw new Error(data.message || 'Payment processing failed');

    } catch (error) {
        console.error('Payment error:', error);
        showLoading(false);
        showPaymentError(error.message || 'Payment failed. Please try again.');
        paymentState.processing = false;
        if (payBtn) payBtn.disabled = false;
        if (payBtnText) payBtnText.textContent = originalText;
    }
}

// ==================== HANDLE PAYMENT RETURN ====================
function handlePaymentReturn() {
    console.log('=== HANDLING PAYMENT RETURN ===');

    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    let sessionId = urlParams.get('session_id'); // Stripe
    const token = urlParams.get('token');        // PayPal order ID
    const payerId = urlParams.get('PayerID');    // PayPal payer ID
    let ref = urlParams.get('ref');

    // Fix: Stripe session_id may be embedded in ref if URL wasn't formatted correctly
    if (!sessionId && ref && ref.includes('?session_id=')) {
        const parts = ref.split('?session_id=');
        ref = parts[0];
        sessionId = parts[1];
        console.log('Extracted session_id from ref:', sessionId);
    }

    console.log('URL Params:', { paymentStatus, sessionId, token, payerId, ref });

    // Clean URL immediately
    window.history.replaceState({}, document.title, window.location.pathname);

    // Restore session data
    const sessionData = restoreSessionFromStorage();

    if (!sessionData) {
        console.error('No session data found');
        showPaymentReturnError('Your session has expired. Please start the registration process again.');
        return;
    }

    console.log('Session restored:', sessionData);

    // Restore state
    formData = sessionData.formData;
    paymentState.customerId = sessionData.paymentState.customerId;
    paymentState.promoApplied = sessionData.paymentState.promoApplied;
    paymentState.promoCredit = sessionData.paymentState.promoCredit;
    paymentState.walletBalance = sessionData.paymentState.walletBalance;
    paymentState.amountDue = sessionData.paymentState.amountDue;

    // Show onboarding at step 4
    showOnboardingPage();
    showStep(4);

    // Restore promo UI if applied
    if (paymentState.promoApplied) {
        showAppliedPromo(paymentState.promoApplied, paymentState.promoCredit);
    }
    updatePaymentDisplay();

    // Handle based on payment status and gateway
    if (paymentStatus === 'success') {
        console.log('Payment success - verifying...');

        if (sessionData.gateway === 'STRIPE') {
            // Use session_id from URL or stored gatewayOrderId
            const stripeSessionId = sessionId || sessionData.gatewayOrderId;
            if (stripeSessionId) {
                verifyStripePayment(stripeSessionId);
            } else {
                showPaymentError('Could not verify Stripe payment. Please contact support.');
            }
        } else if (sessionData.gateway === 'PAYPAL') {
            // PayPal returns token in URL
            const paypalToken = token || sessionData.gatewayOrderId;
            if (paypalToken) {
                verifyPayPalPayment(paypalToken, payerId);
            } else {
                showPaymentError('Could not verify PayPal payment. Please contact support.');
            }
        } else {
            showPaymentError('Unknown payment gateway. Please contact support.');
        }
    } else if (paymentStatus === 'cancelled') {
        console.log('Payment cancelled');
        showPaymentError('Payment was cancelled. Please try again when ready.');
        paymentState.processing = false;
    } else {
        showPaymentError('Payment could not be completed. Please try again.');
        paymentState.processing = false;
    }
}

async function verifyStripePayment(sessionId) {
    console.log('Verifying Stripe session:', sessionId);
    showLoading(true, 'Verifying payment...');

    try {
        const response = await fetch(`${API_BASE_URL}/v1/payment/stripe/verify-session/${sessionId}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        const data = await response.json();
        console.log('Stripe verification response:', data);

        showLoading(false);

        if (data.success) {
            console.log('Payment verified!');
            clearPaymentSession();
            handlePaymentSuccess(data);
        } else {
            throw new Error(data.message || 'Payment verification failed');
        }

    } catch (error) {
        console.error('Stripe verification error:', error);
        showLoading(false);
        showPaymentError(error.message || 'Could not verify payment. Please contact support if you were charged.');
        paymentState.processing = false;
    }
}

async function verifyPayPalPayment(token, payerId) {
    console.log('Capturing PayPal payment:', token);
    showLoading(true, 'Verifying PayPal payment...');

    try {
        const response = await fetch(`${API_BASE_URL}/v1/payment/paypal/capture/${token}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ payerId: payerId })
        });

        const data = await response.json();
        console.log('PayPal capture response:', data);

        showLoading(false);

        if (data.success) {
            console.log('PayPal payment captured!');
            clearPaymentSession();
            handlePaymentSuccess(data);
        } else {
            throw new Error(data.message || 'PayPal capture failed');
        }

    } catch (error) {
        console.error('PayPal capture error:', error);
        showLoading(false);
        showPaymentError(error.message || 'Could not complete PayPal payment. Please contact support.');
        paymentState.processing = false;
    }
}

function showOnboardingPage() {
    console.log('Showing onboarding page...');

    const mainContent = document.getElementById('main-content');
    const footer = document.querySelector('.footer');
    const navbar = document.querySelector('.navbar');
    const onboardingPage = document.getElementById('onboarding-page');

    if (!onboardingPage) {
        console.error('Onboarding page element not found! Waiting for DOM...');
        // Retry after a short delay
        setTimeout(showOnboardingPage, 100);
        return;
    }

    if (mainContent) mainContent.style.display = 'none';
    if (footer) footer.style.display = 'none';
    if (navbar) navbar.style.display = 'none';

    onboardingPage.classList.add('active');
    onboardingPage.style.display = 'block';
    console.log('Onboarding page shown');
}

function showStep(stepNumber) {
    console.log('Showing step:', stepNumber);

    // ALWAYS ensure onboarding page container is visible
    const onboardingPage = document.getElementById('onboarding-page');
    if (onboardingPage) {
        onboardingPage.style.display = 'block';
    }

    // Hide all steps
    for (let i = 1; i <= 5; i++) {
        const step = document.getElementById(`step-${i}`);
        if (step) step.style.display = 'none';
    }

    // Show current step
    const currentStep = document.getElementById(`step-${stepNumber}`);
    if (currentStep) {
        currentStep.style.display = 'block';
    }

    // Update progress indicators
    updateProgress(stepNumber);

    // Hide other page elements when showing onboarding
    if (stepNumber >= 1) {
        const mainContent = document.querySelector('.main-content');
        const footer = document.querySelector('footer');
        const navbar = document.querySelector('nav');

        if (mainContent) mainContent.style.display = 'none';
        if (footer) footer.style.display = 'none';
        if (navbar) navbar.style.display = 'none';
    }
}

function updateProgress(stepNumber) {
    for (let i = 1; i <= 5; i++) {
        const progressEl = document.getElementById(`progress-${i}`);
        if (!progressEl) continue;

        progressEl.classList.remove('active', 'completed');
        if (i < stepNumber) {
            progressEl.classList.add('completed');
        } else if (i === stepNumber) {
            progressEl.classList.add('active');
        }
    }
}

function showPaymentReturnError(message) {
    // Show main content with an error
    const mainContent = document.getElementById('main-content');
    const onboardingPage = document.getElementById('onboarding-page');

    if (mainContent) mainContent.style.display = 'block';
    if (onboardingPage) {
        onboardingPage.classList.remove('active');
        onboardingPage.style.display = 'none';
    }

    // Show alert (you could create a nicer modal)
    alert(message);
}

async function verifyPaymentCompletion(sessionData, stripeSessionId, paypalToken) {
    console.log('Verifying payment completion...', { stripeSessionId, paypalToken });
    showLoading(true, 'Verifying payment...');

    try {
        let response;

        if (sessionData.gateway === 'STRIPE' && stripeSessionId) {
            // Verify Stripe session
            console.log('Verifying Stripe session:', stripeSessionId);
            response = await fetch(`${API_BASE_URL}/v1/payment/stripe/verify-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: stripeSessionId,
                    ledgerEntryId: sessionData.ledgerEntryId
                })
            });
        } else if (sessionData.gateway === 'PAYPAL' && paypalToken) {
            // Capture PayPal order
            console.log('Capturing PayPal order:', paypalToken);
            response = await fetch(`${API_BASE_URL}/v1/payment/paypal/capture/${paypalToken}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } else {
            // Fallback: verify by reference
            console.log('Verifying by reference:', sessionData.referenceId);
            response = await fetch(`${API_BASE_URL}/v1/payment/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    referenceId: sessionData.referenceId,
                    ledgerEntryId: sessionData.ledgerEntryId
                })
            });
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Verification response error:', errorText);
            throw new Error('Payment verification failed');
        }

        const result = await response.json();
        console.log('Verification result:', result);

        showLoading(false);

        // Check various success indicators
        if (result.success || result.status === 'COMPLETED' || result.status === 'PAID' || result.paid === true) {
            console.log('Payment verified successfully!');
            clearPaymentSession();
            handlePaymentSuccess(result);
        } else {
            throw new Error(result.message || 'Payment verification failed');
        }

    } catch (error) {
        console.error('Payment verification error:', error);
        showLoading(false);
        showPaymentError(error.message || 'Could not verify payment. Please contact support if you were charged.');
    }
}

// ==================== PAYMENT SUCCESS HANDLER ====================
function handlePaymentSuccess(result) {
    console.log('=== PAYMENT SUCCESS ===', result);
    clearPaymentSession();

    // Populate success page with account details
    if (result && result.formData && result.formData.response) {
        const response = result.formData.response;
        document.getElementById('confirm-accountId').textContent = response.accountId || 'N/A';
        document.getElementById('confirm-email').textContent = response.email || 'N/A';
        document.getElementById('confirm-business').textContent = response.businessName || 'N/A';
    }

    // Hide loading
    hideLoading();

    // Force show onboarding container AND step 5
    const onboardingPage = document.getElementById('onboarding-page');
    if (onboardingPage) {
        onboardingPage.style.display = 'block';
    }

    showStep(5);
}

function hideLoading() {
    showLoading(false);
}

// ==================== PAYMENT ERROR UI ====================
function showPaymentError(message) {
    console.log('Showing payment error:', message);

    let errorBanner = document.getElementById('payment-error-banner');
    const cardBody = document.querySelector('#step-4 .card-body');

    if (!errorBanner && cardBody) {
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
        cardBody.insertBefore(errorBanner, cardBody.firstChild);
    }

    if (errorBanner) {
        errorBanner.innerHTML = `
            <i class="fas fa-exclamation-circle" style="margin-top: 2px; flex-shrink: 0;"></i>
            <div style="flex: 1;">
                <strong>Payment Error</strong>
                <p style="margin: 0.25rem 0 0 0; font-size: 0.9rem; opacity: 0.9;">${message}</p>
            </div>
            <button onclick="hidePaymentError()" style="background:none;border:none;color:#ff4d4d;cursor:pointer;padding:0.5rem;">
                <i class="fas fa-times"></i>
            </button>
        `;
        errorBanner.style.display = 'flex';
    }
}

function hidePaymentError() {
    const errorBanner = document.getElementById('payment-error-banner');
    if (errorBanner) errorBanner.style.display = 'none';
}

// ==================== NAVIGATION ====================
function goToDashboard() {
    window.location.href = 'https://qa.koorierinc.net/login';
}

console.log('Koorier DTS Registration Page Loaded - v2');