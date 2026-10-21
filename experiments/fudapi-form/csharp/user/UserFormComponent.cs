// WRITTEN BY THE DEVELOPER. The handler of `save`: what was inside `.handle(...)` in user-form.fud.
// When it runs, `person` already passed every rule: the NIF letter and that nobody has it.
using Api.Contracts;

namespace Api.Components;

public sealed class UserFormComponent(People people, ILogger<UserFormComponent> log) : IUserForm
{
    public async Task<Saved> Save(SaveCtx ctx, PersonForm person, CancellationToken ct)
    {
        // A 409: the form keeps it (its `catches`) and paints it in the summary.
        if (person.Name.Trim().ToLowerInvariant() == "admin") throw SaveFails.Reserved();
        log.LogInformation("[user-form] {User} da de alta a {Name}", ctx.User.Name, person.Name);
        return await people.Add(person, ct);
    }
}
