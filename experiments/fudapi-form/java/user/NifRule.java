// WRITTEN BY THE DEVELOPER. The server half of `rule nif`: the same algorithm as ts/user/nif.ts.
package app.rules;

import app.contracts.Shared.Nif;
import java.util.regex.Pattern;

public final class NifRule implements Nif {
    private static final String LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
    private static final Pattern SHAPE = Pattern.compile("[XYZxyz0-9][0-9]{7}[A-Za-z]");

    @Override
    public boolean check(String value) {
        if (!SHAPE.matcher(value).matches()) return false;
        var v = value.toUpperCase();
        var lead = "XYZ".indexOf(v.charAt(0)); // NIE: X -> 0, Y -> 1, Z -> 2
        var number = Integer.parseInt((lead == -1 ? v.substring(0, 1) : Integer.toString(lead)) + v.substring(1, 8));
        return LETTERS.charAt(number % 23) == v.charAt(8);
    }
}
