// WRITTEN BY THE DEVELOPER. `rule nif-unique`: asks the database. `People` is the app's own repository.
using Api.Contracts;

namespace Api.Rules;

public sealed class NifUniqueRule(People people) : INifUnique
{
    public async Task<bool> Check(string value, CancellationToken ct) => !await people.HasNif(value, ct);
}
