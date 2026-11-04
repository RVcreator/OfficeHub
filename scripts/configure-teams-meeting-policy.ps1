[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string[]]$OrganizerEmails,
 [switch]$Apply
)
$ErrorActionPreference='Stop'
$officeHubApp='6a459b19-e4f7-4274-87ce-be470b9e5a70'
$officeHubPolicy='OfficeHub-Meeting-Organizers'
if(-not(Get-Module -ListAvailable MicrosoftTeams)){
 throw 'Install the official MicrosoftTeams module from PSGallery for CurrentUser, then rerun this script.'
}
Import-Module MicrosoftTeams
# Complete Microsoft sign-in yourself; no password or token is stored here.
Connect-MicrosoftTeams -TenantId '65fbd6da-f82e-404a-a0ad-2aa95b091b8e' | Out-Null
$targets=@()
foreach($address in ($OrganizerEmails | ForEach-Object { $_.Trim().ToLowerInvariant() } | Sort-Object -Unique)){
 if($address -notmatch '^[a-z0-9._%+-]+@wipahs\.org$'){throw 'Only explicitly selected @wipahs.org organizer accounts are allowed.'}
 $member=Get-CsOnlineUser -Identity $address
 if($member.UserPrincipalName -ine $address){throw "Microsoft returned an unexpected account for $address. No changes applied."}
 if($member.ApplicationAccessPolicy -and $member.ApplicationAccessPolicy -notin @($officeHubPolicy,"Tag:$officeHubPolicy")){
  throw "$address already has another application policy. Preserve it and ask the Microsoft administrator to reconcile the policies. No changes applied."
 }
 $targets+=$member
}
$existing=Get-CsApplicationAccessPolicy | Where-Object { $_.Identity -in @($officeHubPolicy,"Tag:$officeHubPolicy") }
if($existing -and (@($existing.AppIds).Count -ne 1 -or @($existing.AppIds)[0] -ne $officeHubApp)){
 throw 'The named policy has different app assignments. No changes applied.'
}
if(-not $Apply){$targets | Select-Object UserPrincipalName,Identity,ApplicationAccessPolicy;Write-Output 'Read-only plan. Rerun with -Apply after reviewing these exact organizers.';return}
if(-not $existing){New-CsApplicationAccessPolicy -Identity $officeHubPolicy -AppIds $officeHubApp -Description 'OfficeHub Teams meeting sync for explicitly assigned organizers only' | Out-Null}
foreach($member in $targets){Grant-CsApplicationAccessPolicy -Identity $member.Identity -PolicyName $officeHubPolicy}
foreach($member in $targets){Get-CsOnlineUser -Identity $member.UserPrincipalName | Select-Object UserPrincipalName,ApplicationAccessPolicy}
# No Global grant: future organizers require an explicit reviewed assignment.
