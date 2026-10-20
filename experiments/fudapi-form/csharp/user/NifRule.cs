// WRITTEN BY THE DEVELOPER. The server half of `rule nif`: the same algorithm as ts/user/nif.ts.
using System.Text.RegularExpressions;
using Api.Contracts;

namespace Api.Rules;

public sealed partial class NifRule : INif
{
    private const string Letters = "TRWAGMYFPDXBNJZSQVHLCKE";

    [GeneratedRegex(@"\A[XYZxyz0-9][0-9]{7}[A-Za-z]\z")]
    private static partial Regex Shape();

    public bool Check(string value)
    {
        if (!Shape().IsMatch(value)) return false;
        var v = value.ToUpperInvariant();
        var lead = "XYZ".IndexOf(v[0]); // NIE: X → 0, Y → 1, Z → 2
        var number = int.Parse((lead == -1 ? v[..1] : lead.ToString()) + v[1..8]);
        return Letters[number % 23] == v[8];
    }
}
