/**
 * Form Helper Utilities
 * Shared utility functions for form handling across modals
 */

/**
 * Add item to array if it doesn't already exist
 * @param {Array} array - The array to add to
 * @param {string} item - The item to add (will be trimmed)
 * @returns {Array} - New array with item added
 */
export function addToArray(array, item) {
  const trimmedItem = item.trim();
  if (trimmedItem && !array.includes(trimmedItem)) {
    return [...array, trimmedItem];
  }
  return array;
}

/**
 * Remove item from array
 * @param {Array} array - The array to remove from
 * @param {string} item - The item to remove
 * @returns {Array} - New array without item
 */
export function removeFromArray(array, item) {
  return array.filter(i => i !== item);
}

/**
 * Validate enum value
 * @param {string} value - The value to validate
 * @param {Array} validValues - Array of valid values
 * @returns {boolean} - True if valid
 */
export function validateEnum(value, validValues) {
  if (!value) return true; // Empty is valid (optional field)
  return validValues.includes(value);
}

/**
 * Validate string length
 * @param {string} value - The string to validate
 * @param {number} maxLength - Maximum allowed length
 * @param {number} minLength - Minimum allowed length (default: 0)
 * @returns {Object} - { valid: boolean, error: string }
 */
export function validateStringLength(value, maxLength, minLength = 0) {
  if (value.length < minLength) {
    return {
      valid: false,
      error: `Liian lyhyt (min ${minLength} merkkiä)`
    };
  }
  if (value.length > maxLength) {
    return {
      valid: false,
      error: `Liian pitkä (max ${maxLength} merkkiä)`
    };
  }
  return { valid: true, error: null };
}

/**
 * Validate number range
 * @param {number} value - The number to validate
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {Object} - { valid: boolean, error: string }
 */
export function validateNumberRange(value, min, max) {
  if (isNaN(value)) {
    return {
      valid: false,
      error: 'Ei ole numero'
    };
  }
  if (value < min || value > max) {
    return {
      valid: false,
      error: `Anna arvo väliltä ${min}-${max}`
    };
  }
  return { valid: true, error: null };
}

/**
 * Auto-clear error for field when value changes
 * @param {Object} errors - Current errors object
 * @param {string} field - Field name
 * @returns {Object} - New errors object without the field
 */
export function clearFieldError(errors, field) {
  if (!errors[field]) return errors;
  const newErrors = { ...errors };
  delete newErrors[field];
  return newErrors;
}

/**
 * Create input change handler with auto-clear errors
 * @param {Function} setFormData - State setter for form data
 * @param {Function} setErrors - State setter for errors
 * @param {Object} errors - Current errors
 * @returns {Function} - Handler function
 */
export function createInputChangeHandler(setFormData, setErrors, errors) {
  return (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    if (errors[field]) {
      setErrors(clearFieldError(errors, field));
    }
  };
}

/**
 * Create nested field change handler (e.g., for arc.beginning)
 * @param {Function} setFormData - State setter for form data
 * @param {string} parentField - Parent field name (e.g., 'arc')
 * @returns {Function} - Handler function
 */
export function createNestedFieldHandler(setFormData, parentField) {
  return (field, value) => {
    setFormData(prev => ({
      ...prev,
      [parentField]: {
        ...prev[parentField],
        [field]: value
      }
    }));
  };
}

/**
 * Validate required field
 * @param {string} value - Value to validate
 * @param {string} fieldName - Field name for error message
 * @returns {Object} - { valid: boolean, error: string }
 */
export function validateRequired(value, fieldName) {
  if (!value || !value.trim()) {
    return {
      valid: false,
      error: `${fieldName} on pakollinen`
    };
  }
  return { valid: true, error: null };
}

/**
 * Validate API key format
 * @param {string} apiKey - API key to validate
 * @returns {Object} - { valid: boolean, error: string }
 */
export function validateApiKey(apiKey) {
  const trimmed = apiKey.trim();

  if (!trimmed) {
    return { valid: false, error: 'API-avain ei voi olla tyhjä' };
  }
  if (trimmed.length < 20) {
    return { valid: false, error: 'API-avain on liian lyhyt (min 20 merkkiä)' };
  }
  if (trimmed.length > 500) {
    return { valid: false, error: 'API-avain on liian pitkä (max 500 merkkiä)' };
  }
  if (/\s/.test(trimmed)) {
    return { valid: false, error: 'API-avain ei voi sisältää välilyöntejä' };
  }

  return { valid: true, error: null };
}
