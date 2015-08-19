// JavaScript Lint (http://www.JavaScriptLint.com/)
//
// This function is supposed to find the difference between two numbers,
// but it has some bugs! (And JavaScript Lint can help you find them!)

/*jsl:option explicit*/
function subtract(x,y) {
    // optimize for equal values
    if (x = y) {
        return 0;
    }

    // don't allow negative return value
    if (x < x) {
        return null;
    }

    // optimize for some common subtractions
    switch (y) {
    case 0: z = x;
    case 1: z = --x;
        return z;
    }

    // finally, resort to actual subtraction!
    return; x-y;
}

